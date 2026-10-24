import {
  DescribeComplianceByConfigRuleCommand, DescribeConfigRulesCommand, DescribeConfigurationRecorderStatusCommand,
  GetComplianceDetailsByConfigRuleCommand, ListConfigurationRecordersCommand,
  type ConfigServiceClient,
} from '@aws-sdk/client-config-service';

const MAX_RULE_PAGES = 5;
const MAX_DETAIL_RULES = 20;
const MAX_DETAIL_PAGES = 2;

/** Bounded, read-only collection. Detail failures must not discard the base inventory. */
export async function collectConfigPosture(client: Pick<ConfigServiceClient, 'send'>) {
  const [recorderList, recorderResponse, complianceResponse] = await Promise.all([
    client.send(new ListConfigurationRecordersCommand({ MaxResults: 20 })),
    client.send(new DescribeConfigurationRecorderStatusCommand({})),
    client.send(new DescribeComplianceByConfigRuleCommand({})),
  ]);
  const statuses = new Map((recorderResponse.ConfigurationRecordersStatus ?? []).map((recorder) => [recorder.arn ?? recorder.name, recorder]));
  const sources = new Map<string, string>();
  let metadataError: string | null = null;
  let metadataTruncated = false;
  try {
    let token: string | undefined;
    for (let page = 0; page < MAX_RULE_PAGES; page++) {
      const response = await client.send(new DescribeConfigRulesCommand({ NextToken: token }));
      for (const rule of response.ConfigRules ?? []) {
        if (rule.ConfigRuleName && rule.Source?.Owner === 'AWS' && rule.Source.SourceIdentifier) {
          sources.set(rule.ConfigRuleName, rule.Source.SourceIdentifier);
        }
      }
      token = response.NextToken;
      if (!token) break;
    }
    metadataTruncated = Boolean(token);
  } catch (error) {
    metadataError = error instanceof Error ? error.message : String(error);
  }
  let detailRules = 0;
  const rules = [];
  for (const rule of complianceResponse.ComplianceByConfigRules ?? []) {
    const resources: { id: string; type: string; annotation?: string }[] = [];
    let detailError: string | null = null;
    let detailsTruncated = false;
    if (rule.Compliance?.ComplianceType === 'NON_COMPLIANT' && rule.ConfigRuleName) {
      if (detailRules >= MAX_DETAIL_RULES) {
        detailsTruncated = true;
      } else {
        detailRules++;
        try {
          let token: string | undefined;
          const seen = new Set<string>();
          for (let page = 0; page < MAX_DETAIL_PAGES; page++) {
            const response = await client.send(new GetComplianceDetailsByConfigRuleCommand({
              ConfigRuleName: rule.ConfigRuleName, ComplianceTypes: ['NON_COMPLIANT'], Limit: 100, NextToken: token,
            }));
            for (const result of response.EvaluationResults ?? []) {
              const resource = result.EvaluationResultIdentifier?.EvaluationResultQualifier;
              if (result.ComplianceType !== 'NON_COMPLIANT' || !resource?.ResourceId || !resource.ResourceType) continue;
              const key = `${resource.ResourceType}:${resource.ResourceId}`;
              if (seen.has(key)) continue;
              seen.add(key);
              resources.push({ id: resource.ResourceId, type: resource.ResourceType, annotation: result.Annotation });
            }
            token = response.NextToken;
            if (!token) break;
          }
          detailsTruncated = Boolean(token);
          const expected = rule.Compliance.ComplianceContributorCount?.CappedCount ?? 0;
          if (resources.length < expected || rule.Compliance.ComplianceContributorCount?.CapExceeded) detailsTruncated = true;
        } catch (error) {
          detailError = error instanceof Error ? error.message : String(error);
          detailsTruncated = true;
        }
      }
    }
    rules.push({
      name: rule.ConfigRuleName, complianceType: rule.Compliance?.ComplianceType,
      nonCompliantResources: rule.Compliance?.ComplianceContributorCount?.CappedCount ?? 0,
      capExceeded: rule.Compliance?.ComplianceContributorCount?.CapExceeded ?? false,
      sourceIdentifier: rule.ConfigRuleName ? sources.get(rule.ConfigRuleName) : undefined,
      resources, detailError, detailsTruncated,
    });
  }
  return {
    recorders: (recorderList.ConfigurationRecorderSummaries ?? []).map((recorder) => {
      const status = statuses.get(recorder.arn ?? recorder.name);
      return {
        arn: recorder.arn, name: recorder.name, servicePrincipal: recorder.servicePrincipal,
        recordingScope: recorder.recordingScope, recording: status?.recording ?? recorder.recordingScope === 'INTERNAL', lastStatus: status?.lastStatus,
        lastErrorCode: status?.lastErrorCode, lastStatusChangeTime: status?.lastStatusChangeTime?.toISOString(),
      };
    }),
    rules, metadataError,
    truncated: Boolean(recorderList.NextToken || complianceResponse.NextToken || metadataTruncated || metadataError
      || rules.some((rule) => rule.detailsTruncated)),
  };
}
