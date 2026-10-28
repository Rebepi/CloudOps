import { fromIni, fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand, DescribeAvailabilityZonesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeRouteTablesCommand, DescribeSecurityGroupsCommand, DescribeInternetGatewaysCommand, DescribeNatGatewaysCommand, DescribeFlowLogsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand, GetPublicAccessBlockCommand, GetBucketPolicyStatusCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { CloudWatchClient, GetMetricDataCommand, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand, type ResultByTime } from '@aws-sdk/client-cost-explorer';
import { CloudTrailClient, LookupEventsCommand, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { IAMClient, ListUsersCommand, ListRolesCommand, GetAccountSummaryCommand, ListMFADevicesCommand, ListAttachedUserPoliciesCommand, ListUserPoliciesCommand, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand, SimulatePrincipalPolicyCommand } from '@aws-sdk/client-iam';
import { SecurityHubClient, DescribeSecurityHubV2Command, GetEnabledStandardsCommand, GetFindingsCommand, GetFindingsV2Command } from '@aws-sdk/client-securityhub';
import { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { Inspector2Client, BatchGetAccountStatusCommand, ListCoverageCommand, ListFindingsCommand as ListInspectorFindingsCommand } from '@aws-sdk/client-inspector2';
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { CloudFrontClient, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { Route53Client, ListHostedZonesCommand } from '@aws-sdk/client-route-53';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { WAFV2Client, ListWebACLsCommand } from '@aws-sdk/client-wafv2';
import { KMSClient, ListKeysCommand } from '@aws-sdk/client-kms';
import { BudgetsClient, DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import { ComputeOptimizerClient, GetEC2InstanceRecommendationsCommand } from '@aws-sdk/client-compute-optimizer';
import { config } from './config.js';
import { collectConfigPosture } from './security/configCollector.js';
import { measureAnalyzer, recordAnalyzerTiming, type AnalyzerTimings } from './security/analyzerTiming.js';

const sourceCredentials = fromIni({ profile: config.awsProfile });
const credentials = config.awsRoleArn
  ? fromTemporaryCredentials({
      masterCredentials: sourceCredentials,
      clientConfig: { region: config.region, maxAttempts: 2 },
      params: {
        RoleArn: config.awsRoleArn,
        RoleSessionName: config.awsRoleSessionName,
        ...(config.awsExternalId ? { ExternalId: config.awsExternalId } : {}),
      },
    })
  : sourceCredentials;
const clientConfig = (region: string) => ({ region, credentials, maxAttempts: 2 });
const ec2 = (region: string) => new EC2Client(clientConfig(region));

export const aws = {
  sts: new STSClient(clientConfig(config.region)),
  s3: new S3Client(clientConfig(config.region)),
  ce: new CostExplorerClient(clientConfig('us-east-1')),
  iam: new IAMClient(clientConfig('us-east-1')),
  pricing: new PricingClient(clientConfig('us-east-1')),
};

export function awsError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function securityHubError(error: unknown): string {
  if (error instanceof Error && error.name === 'SubscriptionRequiredException') {
    return 'Security Hub no está disponible en el plan gratuito actual. Actualiza la cuenta al plan de pago y habilita Essentials en esta región.';
  }
  return awsError(error);
}

type SecurityHubFinding = { id?: string; title?: string; severity?: string; status?: string; resource?: string; description?: string; recommendation?: string };

const SECURITY_HUB_PAGE_SIZE = 50;
const SECURITY_HUB_MAX_PAGES = 20;
const SECURITY_HUB_MAX_FINDINGS = 1000;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function normalizeSecurityHubV2Finding(document: unknown): SecurityHubFinding {
  const finding = document && typeof document === 'object' ? document as Record<string, unknown> : {};
  const info = finding.finding_info && typeof finding.finding_info === 'object' ? finding.finding_info as Record<string, unknown> : {};
  const severity = finding.severity && typeof finding.severity === 'object' ? finding.severity as Record<string, unknown> : {};
  const status = finding.status && typeof finding.status === 'object' ? finding.status as Record<string, unknown> : {};
  const resources = Array.isArray(finding.resources) ? finding.resources : [];
  const resource = resources[0] && typeof resources[0] === 'object' ? resources[0] as Record<string, unknown> : {};
  return {
    id: stringValue(info.uid) ?? stringValue(finding.uid),
    title: stringValue(info.title) ?? stringValue(finding.title),
    description: stringValue(info.desc) ?? stringValue(finding.message),
    severity: (stringValue(finding.severity) ?? stringValue(severity.label) ?? (typeof finding.severity_id === 'number' ? String(finding.severity_id) : undefined))?.toUpperCase(),
    status: (stringValue(finding.status) ?? stringValue(status.name) ?? (typeof finding.status_id === 'number' ? String(finding.status_id) : undefined))?.toUpperCase(),
    resource: stringValue(resource.uid) ?? stringValue(resource.name),
  };
}

export async function identity() {
  const result = await aws.sts.send(new GetCallerIdentityCommand({}));
  return {
    account: result.Account,
    arn: result.Arn,
    userId: result.UserId,
    profile: config.awsProfile,
    roleArn: config.awsRoleArn || null,
  };
}

export type AwsPrincipalType = 'root' | 'assumed-role' | 'iam-role' | 'iam-user' | 'unknown';

export function classifyAwsPrincipal(arn?: string): AwsPrincipalType {
  if (!arn) return 'unknown';
  if (/^arn:[^:]+:iam::\d{12}:root$/.test(arn)) return 'root';
  if (/^arn:[^:]+:sts::\d{12}:assumed-role\//.test(arn)) return 'assumed-role';
  if (/^arn:[^:]+:iam::\d{12}:role\//.test(arn)) return 'iam-role';
  if (/^arn:[^:]+:iam::\d{12}:user\//.test(arn)) return 'iam-user';
  return 'unknown';
}

export function connectionStatusFor(caller: Awaited<ReturnType<typeof identity>>) {
  const principalType = classifyAwsPrincipal(caller.arn);
  const rootBlocked = principalType === 'root' && !config.awsAllowRootAudit;
  const roleConfigured = Boolean(config.awsRoleArn);
  const roleActive = principalType === 'assumed-role' || principalType === 'iam-role';
  const readyForAssessment = roleActive || (principalType === 'root' && config.awsAllowRootAudit);
  const checks = [
    { id: 'credentials', label: 'Credenciales AWS válidas', status: 'passed' as const, detail: caller.account ?? 'Cuenta no identificada' },
    {
      id: 'non-root',
      label: 'Principal distinto de root',
      status: principalType === 'root' ? 'failed' as const : 'passed' as const,
      detail: principalType === 'root' ? 'La aplicación todavía usa credenciales root.' : `Principal ${principalType}`,
    },
    {
      id: 'assume-role',
      label: 'Rol IAM de auditoría asumido',
      status: roleActive ? 'passed' as const : 'failed' as const,
      detail: roleActive ? (config.awsRoleArn || caller.arn || 'Rol activo') : roleConfigured ? 'El rol está configurado, pero STS no devolvió una sesión de rol.' : 'Define AWS_ROLE_ARN para usar credenciales temporales.',
    },
  ];
  return {
    ...caller,
    principalType,
    roleConfigured,
    roleActive,
    externalIdConfigured: Boolean(config.awsExternalId),
    rootOverrideEnabled: config.awsAllowRootAudit,
    readyForAssessment,
    checks,
    recommendation: rootBlocked
      ? 'Configura un perfil no root y AWS_ROLE_ARN. Las evaluaciones AWS quedan bloqueadas para evitar operar con root.'
      : roleActive
        ? 'La conexión usa credenciales temporales de un rol IAM y está lista para evaluar.'
        : 'La identidad no es root, pero CloudOps exige una sesión de rol. Configura AWS_ROLE_ARN o un perfil de IAM Identity Center.',
  };
}

export async function connectionStatus() {
  return connectionStatusFor(await identity());
}

export async function assertAssessmentConnection() {
  const status = await connectionStatus();
  if (!status.readyForAssessment) {
    throw Object.assign(new Error(status.recommendation), { statusCode: 403, code: 'AWS_ROOT_AUDIT_BLOCKED' });
  }
  return status;
}

export async function regions() {
  const result = await ec2(config.region).send(new DescribeRegionsCommand({ AllRegions: true }));
  return (result.Regions ?? []).map((r) => ({ id: r.RegionName, status: r.OptInStatus, endpoint: r.Endpoint }));
}

export async function inventory(region: string) {
  const client = ec2(region);
  const [instances, zones, databases] = await Promise.all([
    client.send(new DescribeInstancesCommand({})),
    client.send(new DescribeAvailabilityZonesCommand({})),
    new RDSClient(clientConfig(region)).send(new DescribeDBInstancesCommand({})),
  ]);
  return {
    region,
    zones: (zones.AvailabilityZones ?? []).map((z) => ({ id: z.ZoneId, name: z.ZoneName, state: z.State, type: z.ZoneType, optInStatus: z.OptInStatus })),
    instances: (instances.Reservations ?? []).flatMap((r) => r.Instances ?? []).map((i) => ({
      id: i.InstanceId, type: i.InstanceType, state: i.State?.Name, zone: i.Placement?.AvailabilityZone,
      name: i.Tags?.find((t) => t.Key === 'Name')?.Value ?? null,
      vpcId: i.VpcId, subnetId: i.SubnetId, publicIp: i.PublicIpAddress,
      environment: i.Tags?.find((t) => t.Key?.toLowerCase() === 'environment')?.Value ?? null,
    })),
    databases: (databases.DBInstances ?? []).map((d) => ({
      id: d.DBInstanceIdentifier, engine: d.Engine, class: d.DBInstanceClass,
      status: d.DBInstanceStatus, multiAz: d.MultiAZ, zone: d.AvailabilityZone, vpcId: d.DBSubnetGroup?.VpcId,
    })),
  };
}

export async function buckets() {
  const result = await aws.s3.send(new ListBucketsCommand({}));
  return (result.Buckets ?? []).map((b) => ({ name: b.Name, createdAt: b.CreationDate?.toISOString() }));
}

export async function serviceInventory(region: string) {
  const tasks = {
    lambda: () => new LambdaClient(clientConfig(region)).send(new ListFunctionsCommand({ MaxItems: 50 })).then((r) => ({ items: (r.Functions ?? []).map((f) => ({ id: f.FunctionArn, name: f.FunctionName, state: f.State })), truncated: Boolean(r.NextMarker) })),
    dynamodb: () => new DynamoDBClient(clientConfig(region)).send(new ListTablesCommand({ Limit: 100 })).then((r) => ({ items: (r.TableNames ?? []).map((name) => ({ id: name, name })), truncated: Boolean(r.LastEvaluatedTableName) })),
    cloudfront: () => new CloudFrontClient(clientConfig('us-east-1')).send(new ListDistributionsCommand({ MaxItems: 100 })).then((r) => ({ items: (r.DistributionList?.Items ?? []).map((d) => ({ id: d.Id, name: d.DomainName, state: d.Status })), truncated: Boolean(r.DistributionList?.IsTruncated) })),
    route53: () => new Route53Client(clientConfig('us-east-1')).send(new ListHostedZonesCommand({ MaxItems: 100 })).then((r) => ({ items: (r.HostedZones ?? []).map((z) => ({ id: z.Id, name: z.Name })), truncated: Boolean(r.IsTruncated) })),
    elb: () => new ElasticLoadBalancingV2Client(clientConfig(region)).send(new DescribeLoadBalancersCommand({ PageSize: 100 })).then((r) => ({ items: (r.LoadBalancers ?? []).map((l) => ({ id: l.LoadBalancerArn, name: l.LoadBalancerName, state: l.State?.Code, vpcId: l.VpcId, scheme: l.Scheme, dnsName: l.DNSName })), truncated: Boolean(r.NextMarker) })),
    waf: () => new WAFV2Client(clientConfig(region)).send(new ListWebACLsCommand({ Scope: 'REGIONAL', Limit: 100 })).then((r) => ({ items: (r.WebACLs ?? []).map((w) => ({ id: w.ARN, name: w.Name })), truncated: Boolean(r.NextMarker) })),
    kms: () => new KMSClient(clientConfig(region)).send(new ListKeysCommand({ Limit: 100 })).then((r) => ({ items: (r.Keys ?? []).map((k) => ({ id: k.KeyArn, name: k.KeyId })), truncated: Boolean(r.Truncated) })),
    ebs: () => ec2(region).send(new DescribeVolumesCommand({ MaxResults: 100 })).then((r) => ({ items: (r.Volumes ?? []).map((v) => ({ id: v.VolumeId, name: v.VolumeType, state: v.State })), truncated: Boolean(r.NextToken) })),
    cloudwatch: () => new CloudWatchClient(clientConfig(region)).send(new DescribeAlarmsCommand({ MaxRecords: 100 })).then((r) => ({ items: (r.MetricAlarms ?? []).map((a) => ({ id: a.AlarmArn, name: a.AlarmName, state: a.StateValue })), truncated: Boolean(r.NextToken) })),
  };
  const entries = Object.entries(tasks);
  const settled = await Promise.allSettled(entries.map(([, run]) => run()));
  const resources: Record<string, { items: { id?: string; name?: string; state?: string }[]; truncated: boolean }> = {};
  const errors: Record<string, string> = {};
  settled.forEach((result, index) => {
    const name = entries[index]![0];
    if (result.status === 'fulfilled') resources[name] = result.value;
    else errors[name] = awsError(result.reason);
  });
  return { resources, errors };
}

export async function network(region: string) {
  const client = ec2(region);
  const [vpcs, subnets, routes, groups, gateways, nat, flowLogs] = await Promise.all([
    client.send(new DescribeVpcsCommand({})), client.send(new DescribeSubnetsCommand({})),
    client.send(new DescribeRouteTablesCommand({})), client.send(new DescribeSecurityGroupsCommand({})),
    client.send(new DescribeInternetGatewaysCommand({})), client.send(new DescribeNatGatewaysCommand({})),
    client.send(new DescribeFlowLogsCommand({})),
  ]);
  return {
    region,
    vpcs: (vpcs.Vpcs ?? []).map((v) => ({ id: v.VpcId, cidr: v.CidrBlock, default: v.IsDefault, state: v.State })),
    subnets: (subnets.Subnets ?? []).map((s) => ({ id: s.SubnetId, vpcId: s.VpcId, cidr: s.CidrBlock, zone: s.AvailabilityZone, publicIp: s.MapPublicIpOnLaunch })),
    routes: (routes.RouteTables ?? []).map((r) => ({ id: r.RouteTableId, vpcId: r.VpcId, routes: (r.Routes ?? []).map((x) => ({ destination: x.DestinationCidrBlock ?? x.DestinationIpv6CidrBlock, gateway: x.GatewayId ?? x.NatGatewayId ?? x.TransitGatewayId, state: x.State })) })),
    securityGroups: (groups.SecurityGroups ?? []).map((g) => ({ id: g.GroupId, name: g.GroupName, vpcId: g.VpcId, inboundRules: g.IpPermissions?.length ?? 0, outboundRules: g.IpPermissionsEgress?.length ?? 0,
      publicIngress: (g.IpPermissions ?? []).some((rule) => rule.IpRanges?.some((range) => range.CidrIp === '0.0.0.0/0') || rule.Ipv6Ranges?.some((range) => range.CidrIpv6 === '::/0')),
      ingress: (g.IpPermissions ?? []).flatMap((rule) => {
        const sources = [...(rule.IpRanges ?? []).map((range) => range.CidrIp), ...(rule.Ipv6Ranges ?? []).map((range) => range.CidrIpv6),
          ...(rule.UserIdGroupPairs ?? []).map((pair) => pair.GroupId), ...(rule.PrefixListIds ?? []).map((prefix) => prefix.PrefixListId)].filter((source): source is string => Boolean(source));
        return sources.map((source) => ({ protocol: rule.IpProtocol, fromPort: rule.FromPort, toPort: rule.ToPort, source }));
      }) })),
    internetGateways: (gateways.InternetGateways ?? []).map((g) => ({ id: g.InternetGatewayId, vpcIds: g.Attachments?.map((a) => a.VpcId) ?? [] })),
    natGateways: (nat.NatGateways ?? []).map((g) => ({ id: g.NatGatewayId, vpcId: g.VpcId, state: g.State })),
    flowLogs: (flowLogs.FlowLogs ?? []).map((f) => ({ id: f.FlowLogId, resourceId: f.ResourceId, status: f.FlowLogStatus, destination: f.LogDestinationType })),
  };
}

export async function regionDetail(region: string) {
  const labels = ['inventory', 'network', 'services'] as const;
  const settled = await Promise.allSettled([inventory(region), network(region), serviceInventory(region)]);
  const data: Record<string, unknown> = { region };
  const errors: Record<string, string> = {};
  settled.forEach((result, index) => {
    const label = labels[index]!;
    if (result.status === 'fulfilled') data[label] = result.value;
    else errors[label] = awsError(result.reason);
  });
  return { ...data, errors };
}

export async function zoneDetail(region: string, zoneId: string) {
  const [resources, topology] = await Promise.all([inventory(region), network(region)]);
  const zone = resources.zones.find((z) => z.id === zoneId || z.name === zoneId);
  if (!zone) throw Object.assign(new Error('Zona no encontrada en esta región'), { statusCode: 404 });
  const subnets = topology.subnets.filter((s) => s.zone === zone.name);
  return {
    region, zone,
    instances: resources.instances.filter((i) => i.zone === zone.name),
    databases: resources.databases.filter((d) => d.zone === zone.name),
    subnets,
    vpcs: topology.vpcs.filter((v) => subnets.some((s) => s.vpcId === v.id)),
  };
}

export async function costs(start: string, end: string) {
  const periods: ResultByTime[] = [];
  let nextPage: string | undefined;
  do {
    const result = await aws.ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end }, Granularity: 'DAILY',
      Metrics: ['UnblendedCost'], GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      NextPageToken: nextPage,
    }));
    periods.push(...(result.ResultsByTime ?? []));
    nextPage = result.NextPageToken;
  } while (nextPage);
  const byDay = new Map<string, { start: string | undefined; total: number; currency: string; services: { service: string | undefined; amount: number }[]; estimated: boolean }>();
  for (const period of periods) {
    const key = period.TimePeriod?.Start ?? '';
    const day = byDay.get(key) ?? { start: key, total: 0, currency: 'USD', services: [], estimated: false };
    day.total += Number(period.Total?.UnblendedCost?.Amount ?? period.Groups?.reduce((n, g) => n + Number(g.Metrics?.UnblendedCost?.Amount ?? 0), 0) ?? 0);
    day.services.push(...(period.Groups ?? []).map((g) => ({ service: g.Keys?.[0], amount: Number(g.Metrics?.UnblendedCost?.Amount ?? 0) })));
    day.estimated ||= period.Estimated ?? false;
    byDay.set(key, day);
  }
  return [...byDay.values()].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
}

export async function finops() {
  const account = (await identity()).account;
  if (!account) throw new Error('STS no devolvió el ID de cuenta');
  const [budgets, recommendations] = await Promise.allSettled([
    new BudgetsClient(clientConfig('us-east-1')).send(new DescribeBudgetsCommand({ AccountId: account, MaxResults: 100 })),
    new ComputeOptimizerClient(clientConfig(config.region)).send(new GetEC2InstanceRecommendationsCommand({ maxResults: 100 })),
  ]);
  return {
    budgets: budgets.status === 'fulfilled' ? (budgets.value.Budgets ?? []).map((b) => ({ name: b.BudgetName, type: b.BudgetType, limit: b.BudgetLimit?.Amount, currency: b.BudgetLimit?.Unit, actual: b.CalculatedSpend?.ActualSpend?.Amount, forecast: b.CalculatedSpend?.ForecastedSpend?.Amount })) : null,
    budgetsError: budgets.status === 'rejected' ? awsError(budgets.reason) : null,
    recommendations: recommendations.status === 'fulfilled' ? (recommendations.value.instanceRecommendations ?? []).map((r) => ({ arn: r.instanceArn, currentType: r.currentInstanceType, finding: r.finding, options: (r.recommendationOptions ?? []).slice(0, 3).map((o) => ({ type: o.instanceType, risk: o.performanceRisk, savingsUsd: o.savingsOpportunity?.estimatedMonthlySavings?.value })) })) : null,
    recommendationsError: recommendations.status === 'rejected' ? awsError(recommendations.reason) : null,
  };
}

export async function events(region: string) {
  const result = await new CloudTrailClient(clientConfig(region)).send(new LookupEventsCommand({ MaxResults: 30 }));
  return (result.Events ?? []).map((e) => ({ id: e.EventId, name: e.EventName, source: e.EventSource, time: e.EventTime?.toISOString(), username: e.Username, resources: e.Resources?.map((r) => r.ResourceName) ?? [] }));
}

export async function cpuMetrics(region: string, instanceIds: string[]) {
  if (!instanceIds.length) return [];
  const now = new Date();
  const result = await new CloudWatchClient(clientConfig(region)).send(new GetMetricDataCommand({
    StartTime: new Date(now.getTime() - 60 * 60_000), EndTime: now,
    MetricDataQueries: instanceIds.slice(0, 50).map((id, index) => ({
      Id: `cpu${index}`, Label: id, ReturnData: true,
      MetricStat: { Metric: { Namespace: 'AWS/EC2', MetricName: 'CPUUtilization', Dimensions: [{ Name: 'InstanceId', Value: id }] }, Period: 300, Stat: 'Average' },
    })),
  }));
  return (result.MetricDataResults ?? []).map((m) => ({ instanceId: m.Label, cpuPercent: m.Values?.[0] ?? null, timestamp: m.Timestamps?.[0]?.toISOString() ?? null }));
}

export async function security(region: string) {
  const analyzerTimings: AnalyzerTimings = {};
  const timed = <T>(id: string, operation: () => Promise<T>) => measureAnalyzer(analyzerTimings, id, 'cumulative-request', operation);
  const [users, roles, summary, trails, identity] = await Promise.all([
    timed('aws:iam', () => aws.iam.send(new ListUsersCommand({ MaxItems: 100 }))),
    timed('aws:iam', () => aws.iam.send(new ListRolesCommand({ MaxItems: 100 }))),
    timed('aws:iam', () => aws.iam.send(new GetAccountSummaryCommand({}))),
    timed('aws:cloudtrail', () => new CloudTrailClient(clientConfig(region)).send(new DescribeTrailsCommand({ includeShadowTrails: true }))),
    aws.sts.send(new GetCallerIdentityCommand({})),
  ]);
  const identities = await Promise.all((users.Users ?? []).map(async (u) => {
    const [mfa, attached, inline] = await Promise.all([
      timed('aws:iam', () => aws.iam.send(new ListMFADevicesCommand({ UserName: u.UserName }))),
      timed('aws:iam', () => aws.iam.send(new ListAttachedUserPoliciesCommand({ UserName: u.UserName }))),
      timed('aws:iam', () => aws.iam.send(new ListUserPoliciesCommand({ UserName: u.UserName }))),
    ]);
    return { name: u.UserName, arn: u.Arn, createdAt: u.CreateDate?.toISOString(), mfa: (mfa.MFADevices?.length ?? 0) > 0,
      policies: [...(attached.AttachedPolicies ?? []).map((p) => p.PolicyName ?? ''), ...(inline.PolicyNames ?? [])].filter(Boolean) };
  }));
  const mappedRoles = await Promise.all((roles.Roles ?? []).map(async (r) => {
    const [attached, inline] = await Promise.all([
      timed('aws:iam', () => aws.iam.send(new ListAttachedRolePoliciesCommand({ RoleName: r.RoleName }))),
      timed('aws:iam', () => aws.iam.send(new ListRolePoliciesCommand({ RoleName: r.RoleName }))),
    ]);
    return { name: r.RoleName, arn: r.Arn, createdAt: r.CreateDate?.toISOString(),
      policies: [...(attached.AttachedPolicies ?? []).map((p) => p.PolicyName ?? ''), ...(inline.PolicyNames ?? [])].filter(Boolean) };
  }));
  const hubStarted = performance.now();
  let findings: SecurityHubFinding[] = [];
  let findingsError: string | null = null;
  let findingsTruncated = false;
  let securityHub: { version: 'v2' | 'legacy' | 'unavailable'; enabled: boolean; arn?: string; subscribedAt?: string; features?: unknown } = {
    version: 'unavailable', enabled: false,
  };
  try {
    const client = new SecurityHubClient(clientConfig(region));
    const hub = await client.send(new DescribeSecurityHubV2Command({}));
    let nextToken: string | undefined;
    for (let page = 0; page < SECURITY_HUB_MAX_PAGES; page++) {
      const response = await client.send(new GetFindingsV2Command({ MaxResults: SECURITY_HUB_PAGE_SIZE, NextToken: nextToken }));
      findings.push(...(response.Findings ?? []).map(normalizeSecurityHubV2Finding));
      nextToken = response.NextToken;
      if (!nextToken || findings.length >= SECURITY_HUB_MAX_FINDINGS) break;
    }
    findingsTruncated = Boolean(nextToken);
    securityHub = { version: 'v2', enabled: true, arn: hub.HubV2Arn, subscribedAt: hub.SubscribedAt, features: hub.Features };
  } catch (v2Error) {
    try {
      const client = new SecurityHubClient(clientConfig(region));
      let nextToken: string | undefined;
      for (let page = 0; page < SECURITY_HUB_MAX_PAGES; page++) {
        const response = await client.send(new GetFindingsCommand({ MaxResults: SECURITY_HUB_PAGE_SIZE, NextToken: nextToken }));
        findings.push(...(response.Findings ?? []).map((f) => ({
          id: f.Id, title: f.Title, severity: f.Severity?.Label, status: f.Workflow?.Status,
          resource: f.Resources?.[0]?.Id, description: f.Description,
          recommendation: f.Remediation?.Recommendation?.Text,
        })));
        nextToken = response.NextToken;
        if (!nextToken || findings.length >= SECURITY_HUB_MAX_FINDINGS) break;
      }
      findingsTruncated = Boolean(nextToken);
      securityHub = { version: 'legacy', enabled: true };
    } catch {
      findingsError = securityHubError(v2Error);
    }
  }
  recordAnalyzerTiming(analyzerTimings, 'aws:security-hub', hubStarted, 'elapsed-service');
  let standards: { subscriptionArn?: string; standardsArn?: string; name: string; status?: string; controlsUpdatable?: string }[] = [];
  let standardsError: string | null = null;
  try {
    const response = await new SecurityHubClient(clientConfig(region)).send(new GetEnabledStandardsCommand({ MaxResults: 100 }));
    standards = (response.StandardsSubscriptions ?? []).map((standard) => ({
      subscriptionArn: standard.StandardsSubscriptionArn,
      standardsArn: standard.StandardsArn,
      name: standard.StandardsArn?.includes('aws-foundational-security-best-practices')
        ? 'AWS Foundational Security Best Practices v1.0.0'
        : standard.StandardsArn?.split('/standards/')[1] ?? standard.StandardsArn ?? 'Estándar de Security Hub',
      status: standard.StandardsStatus,
      controlsUpdatable: standard.StandardsControlsUpdatable,
    }));
  } catch (error) {
    standardsError = awsError(error);
  }
  const trailStatuses = await Promise.all((trails.trailList ?? []).map(async (trail) => {
    try {
      const status = await timed('aws:cloudtrail', () => new CloudTrailClient(clientConfig(region)).send(new GetTrailStatusCommand({ Name: trail.TrailARN ?? trail.Name })));
      return { name: trail.Name, arn: trail.TrailARN, multiRegion: trail.IsMultiRegionTrail, logFileValidation: trail.LogFileValidationEnabled, isLogging: status.IsLogging };
    } catch { return { name: trail.Name, arn: trail.TrailARN, multiRegion: trail.IsMultiRegionTrail, logFileValidation: trail.LogFileValidationEnabled, isLogging: null }; }
  }));
  const [configResult, inspectorResult, s3Result, networkResult, rdsResult] = await Promise.allSettled([
    measureAnalyzer(analyzerTimings, 'aws:config', 'elapsed-service', () => configSecurityPosture(region)),
    measureAnalyzer(analyzerTimings, 'aws:inspector', 'elapsed-service', () => inspectorSecurityPosture(region)),
    measureAnalyzer(analyzerTimings, 'aws:s3', 'elapsed-service', () => s3SecurityPosture(region)),
    measureAnalyzer(analyzerTimings, 'aws:ec2-network', 'elapsed-service', () => networkSecurityPosture(region)),
    measureAnalyzer(analyzerTimings, 'aws:rds', 'elapsed-service', () => rdsSecurityPosture(region)),
  ]);
  return {
    accountId: identity.Account,
    analyzerTimings,
    partition: identity.Arn?.split(':')[1],
    region,
    accountSummary: summary.SummaryMap ?? {}, identities,
    roles: mappedRoles,
    trails: trailStatuses,
    findings, findingsError, findingsTruncated, securityHub, standards, standardsError, truncated: Boolean(users.IsTruncated || roles.IsTruncated),
    config: configResult.status === 'fulfilled' ? configResult.value : null,
    configError: configResult.status === 'rejected' ? awsError(configResult.reason) : null,
    inspector: inspectorResult.status === 'fulfilled' ? inspectorResult.value : null,
    inspectorError: inspectorResult.status === 'rejected' ? awsError(inspectorResult.reason) : null,
    s3: s3Result.status === 'fulfilled' ? s3Result.value : null,
    s3Error: s3Result.status === 'rejected' ? awsError(s3Result.reason) : null,
    network: networkResult.status === 'fulfilled' ? networkResult.value : null,
    networkError: networkResult.status === 'rejected' ? awsError(networkResult.reason) : null,
    rds: rdsResult.status === 'fulfilled' ? rdsResult.value : null,
    rdsError: rdsResult.status === 'rejected' ? awsError(rdsResult.reason) : null,
  };
}

async function s3SecurityPosture(region: string) {
  const client = new S3Client(clientConfig(region));
  const response = await client.send(new ListBucketsCommand({}));
  const buckets = await Promise.all((response.Buckets ?? []).slice(0, 100).map(async (bucket) => {
    const name = bucket.Name;
    if (!name) return { name: 'unknown', blockPublicAccess: null, publicPolicy: null, inspectionError: 'Bucket sin nombre' };
    const [block, policy] = await Promise.allSettled([
      client.send(new GetPublicAccessBlockCommand({ Bucket: name })),
      client.send(new GetBucketPolicyStatusCommand({ Bucket: name })),
    ]);
    const configuration = block.status === 'fulfilled' ? block.value.PublicAccessBlockConfiguration : null;
    const blockErrorName = block.status === 'rejected' && typeof block.reason === 'object' && block.reason && 'name' in block.reason
      ? String((block.reason as { name?: unknown }).name ?? '')
      : '';
    const blockPublicAccess = configuration
      ? Boolean(configuration.BlockPublicAcls && configuration.IgnorePublicAcls && configuration.BlockPublicPolicy && configuration.RestrictPublicBuckets)
      : blockErrorName === 'NoSuchPublicAccessBlockConfiguration' ? false : null;
    return {
      name,
      blockPublicAccess,
      publicPolicy: policy.status === 'fulfilled' ? Boolean(policy.value.PolicyStatus?.IsPublic) : null,
      inspectionError: block.status === 'rejected' || policy.status === 'rejected'
        ? [block.status === 'rejected' ? awsError(block.reason) : null, policy.status === 'rejected' ? awsError(policy.reason) : null].filter(Boolean).join(' · ')
        : null,
    };
  }));
  return { buckets, truncated: (response.Buckets?.length ?? 0) > 100 };
}

async function networkSecurityPosture(region: string) {
  const response = await ec2(region).send(new DescribeSecurityGroupsCommand({}));
  return {
    truncated: Boolean(response.NextToken),
    securityGroups: (response.SecurityGroups ?? []).map((group) => ({
      id: group.GroupId,
      name: group.GroupName,
      vpcId: group.VpcId,
      publicIngress: (group.IpPermissions ?? []).flatMap((permission) => {
        const publicCidrs = [
          ...(permission.IpRanges ?? []).filter((range) => range.CidrIp === '0.0.0.0/0').map(() => '0.0.0.0/0'),
          ...(permission.Ipv6Ranges ?? []).filter((range) => range.CidrIpv6 === '::/0').map(() => '::/0'),
        ];
        return publicCidrs.map((cidr) => ({ cidr, protocol: permission.IpProtocol, fromPort: permission.FromPort, toPort: permission.ToPort }));
      }),
    })),
  };
}

async function rdsSecurityPosture(region: string) {
  const response = await new RDSClient(clientConfig(region)).send(new DescribeDBInstancesCommand({ MaxRecords: 100 }));
  return {
    instances: (response.DBInstances ?? []).map((instance) => ({
      id: instance.DBInstanceIdentifier,
      arn: instance.DBInstanceArn,
      engine: instance.Engine,
      publiclyAccessible: Boolean(instance.PubliclyAccessible),
      storageEncrypted: Boolean(instance.StorageEncrypted),
      deletionProtection: Boolean(instance.DeletionProtection),
      multiAz: Boolean(instance.MultiAZ),
    })),
    truncated: Boolean(response.Marker),
  };
}

async function configSecurityPosture(region: string) {
  return collectConfigPosture(new ConfigServiceClient(clientConfig(region)));
}

async function inspectorSecurityPosture(region: string) {
  const client = new Inspector2Client(clientConfig(region));
  const [accountResponse, coverageResponse, findingsResponse] = await Promise.all([
    client.send(new BatchGetAccountStatusCommand({})),
    client.send(new ListCoverageCommand({ maxResults: 100 })),
    client.send(new ListInspectorFindingsCommand({
      maxResults: 100,
      filterCriteria: { findingStatus: [{ comparison: 'EQUALS', value: 'ACTIVE' }] },
    })),
  ]);
  return {
    accountStatus: accountResponse.accounts?.[0]?.state?.status,
    resourceState: accountResponse.accounts?.[0]?.resourceState,
    coverage: (coverageResponse.coveredResources ?? []).map((resource) => ({
      resourceId: resource.resourceId, resourceType: resource.resourceType, scanType: resource.scanType,
      statusCode: resource.scanStatus?.statusCode, statusReason: resource.scanStatus?.reason,
      lastScannedAt: resource.lastScannedAt?.toISOString(),
    })),
    findings: (findingsResponse.findings ?? []).map((finding) => ({
      id: finding.findingArn, title: finding.title, description: finding.description, severity: finding.severity,
      status: finding.status, resource: finding.resources?.[0]?.id, resourceType: finding.resources?.[0]?.type,
      inspectorScore: finding.inspectorScore, fixAvailable: finding.fixAvailable,
      recommendation: finding.remediation?.recommendation?.text,
    })),
    truncated: Boolean(coverageResponse.nextToken || findingsResponse.nextToken),
  };
}

export async function simulatePolicy(principalArn: string, action: string, resourceArn: string) {
  const result = await aws.iam.send(new SimulatePrincipalPolicyCommand({
    PolicySourceArn: principalArn, ActionNames: [action], ResourceArns: [resourceArn],
  }));
  return (result.EvaluationResults ?? []).map((r) => ({ action: r.EvalActionName, resource: r.EvalResourceName, decision: r.EvalDecision, missingContext: r.MissingContextValues ?? [] }));
}

type AlbStats = {
  name: string; dnsName: string; scheme: string;
  totalRequests: number | null; rps: number | null;
  p99Ms: number | null; errors5xx: number | null; errorRate5xx: number | null;
} | null;

export async function albMetrics(region: string) {
  const cw = new CloudWatchClient(clientConfig(region));
  let albList: { arn: string; name: string; dnsName: string; scheme: string }[] = [];
  try {
    const lbResult = await new ElasticLoadBalancingV2Client(clientConfig(region)).send(
      new DescribeLoadBalancersCommand({ PageSize: 50 })
    );
    albList = (lbResult.LoadBalancers ?? [])
      .filter((lb) => lb.Type === 'application' && lb.LoadBalancerArn)
      .map((lb) => ({
        arn: lb.LoadBalancerArn!,
        name: lb.LoadBalancerName ?? '',
        dnsName: lb.DNSName ?? '',
        scheme: lb.Scheme ?? '',
      }));
  } catch { /* sin ALBs o sin permiso */ }

  if (!albList.length) return { albCount: 0, rps: null, p99Ms: null, errorRate5xx: null, albs: [] };

  const now = new Date();
  const start = new Date(now.getTime() - 3_600_000);

  const settled = await Promise.allSettled(albList.slice(0, 3).map(async (lb): Promise<AlbStats> => {
    const albId = lb.arn.match(/loadbalancer\/(.*)/)?.[1] ?? '';
    if (!albId) return null;
    const dim = [{ Name: 'LoadBalancer', Value: albId }];
    const result = await cw.send(new GetMetricDataCommand({
      StartTime: start, EndTime: now,
      MetricDataQueries: [
        { Id: 'req', ReturnData: true, MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'RequestCount', Dimensions: dim }, Period: 3600, Stat: 'Sum' } },
        { Id: 'p99', ReturnData: true, MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime', Dimensions: dim }, Period: 3600, Stat: 'p99' } },
        { Id: 'err5xx', ReturnData: true, MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_ELB_5XX_Count', Dimensions: dim }, Period: 3600, Stat: 'Sum' } },
      ],
    }));
    const req = result.MetricDataResults?.find((m) => m.Id === 'req')?.Values?.[0] ?? null;
    const p99 = result.MetricDataResults?.find((m) => m.Id === 'p99')?.Values?.[0] ?? null;
    const err = result.MetricDataResults?.find((m) => m.Id === 'err5xx')?.Values?.[0] ?? null;
    return {
      name: lb.name, dnsName: lb.dnsName, scheme: lb.scheme,
      totalRequests: req,
      rps: req != null ? Math.round(req / 3600 * 10) / 10 : null,
      p99Ms: p99 != null ? Math.round(p99 * 1000) : null,
      errors5xx: err,
      errorRate5xx: req != null && req > 0 && err != null ? Math.round((err / req) * 10000) / 100 : null,
    };
  }));

  const albs = settled
    .filter((r): r is PromiseFulfilledResult<NonNullable<AlbStats>> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);

  const totalReq = albs.reduce((s, r) => s + (r.totalRequests ?? 0), 0);
  const totalErr = albs.reduce((s, r) => s + (r.errors5xx ?? 0), 0);
  const p99s = albs.map((r) => r.p99Ms).filter((v): v is number => v != null);

  return {
    albCount: albList.length,
    rps: albs.length > 0 ? Math.round(totalReq / 3600 * 10) / 10 : null,
    p99Ms: p99s.length > 0 ? Math.round(p99s.reduce((s, v) => s + v, 0) / p99s.length) : null,
    errorRate5xx: totalReq > 0 ? Math.round((totalErr / totalReq) * 10000) / 100 : null,
    albs,
  };
}

export async function simulateRequest(url: string) {
  if (!/^https?:\/\/[a-zA-Z0-9]/.test(url)) throw Object.assign(new Error('URL inválida'), { statusCode: 400 });
  const hostname = new URL(url).hostname;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost$)/i.test(hostname))
    throw Object.assign(new Error('URL de red privada no permitida'), { statusCode: 400 });
  const start = performance.now();
  try {
    const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000), redirect: 'manual' });
    return { url, status: resp.status, statusText: resp.statusText, milliseconds: Math.round(performance.now() - start), timestamp: new Date().toISOString() };
  } catch (error) {
    return { url, status: 0, statusText: 'Connection failed', error: awsError(error), milliseconds: Math.round(performance.now() - start), timestamp: new Date().toISOString() };
  }
}

export interface AwsPriceQuote {
  sku: string;
  serviceCode: string;
  regionCode: string | null;
  product: string;
  description: string;
  unit: string;
  priceUsd: number;
  rateCode: string;
  beginRange: string;
  endRange: string;
}

export async function price(serviceCode: string, filters: { field: string; value: string }[]): Promise<AwsPriceQuote[]> {
  const quotes: AwsPriceQuote[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 3 && quotes.length < 30; page++) {
    const result = await aws.pricing.send(new GetProductsCommand({
      ServiceCode: serviceCode,
      Filters: filters.map((f) => ({ Field: f.field, Value: f.value, Type: 'TERM_MATCH' })),
      MaxResults: 100,
      NextToken: nextToken,
    }));
    for (const item of result.PriceList ?? []) {
      const parsed = JSON.parse(String(item)) as {
        product?: { sku?: string; attributes?: Record<string, string> };
        terms?: { OnDemand?: Record<string, { priceDimensions?: Record<string, { unit?: string; description?: string; rateCode?: string; beginRange?: string; endRange?: string; pricePerUnit?: { USD?: string } }> }> };
      };
      for (const term of Object.values(parsed.terms?.OnDemand ?? {})) {
        for (const dimension of Object.values(term.priceDimensions ?? {})) {
          const priceUsd = Number(dimension.pricePerUnit?.USD ?? 0);
          if (!(priceUsd > 0)) continue;
          quotes.push({
            sku: parsed.product?.sku ?? '', serviceCode,
            regionCode: parsed.product?.attributes?.regionCode ?? null,
            product: parsed.product?.attributes?.instanceType ?? parsed.product?.attributes?.usagetype ?? parsed.product?.attributes?.productFamily ?? serviceCode,
            description: dimension.description ?? '', unit: dimension.unit ?? '', priceUsd,
            rateCode: dimension.rateCode ?? '', beginRange: dimension.beginRange ?? '0', endRange: dimension.endRange ?? 'Inf',
          });
        }
      }
    }
    nextToken = result.NextToken;
    if (!nextToken) break;
  }
  return quotes.slice(0, 30);
}

export async function latency(region: string) {
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) throw new Error('Región inválida');
  const start = performance.now();
  const response = await fetch(`https://ec2.${region}.amazonaws.com/`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
  return { region, milliseconds: Math.round(performance.now() - start), httpStatus: response.status, measuredAt: new Date().toISOString(), origin: 'backend local' };
}
