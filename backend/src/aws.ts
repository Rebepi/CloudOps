import { fromIni } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand, DescribeAvailabilityZonesCommand, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeRouteTablesCommand, DescribeSecurityGroupsCommand, DescribeInternetGatewaysCommand, DescribeNatGatewaysCommand, DescribeFlowLogsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { CloudWatchClient, GetMetricDataCommand, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand, type ResultByTime } from '@aws-sdk/client-cost-explorer';
import { CloudTrailClient, LookupEventsCommand, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { IAMClient, ListUsersCommand, ListRolesCommand, GetAccountSummaryCommand, ListMFADevicesCommand, ListAttachedUserPoliciesCommand, ListUserPoliciesCommand, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand, SimulatePrincipalPolicyCommand } from '@aws-sdk/client-iam';
import { SecurityHubClient, GetFindingsCommand } from '@aws-sdk/client-securityhub';
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

const credentials = fromIni({ profile: config.awsProfile });
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

export async function identity() {
  const result = await aws.sts.send(new GetCallerIdentityCommand({}));
  return { account: result.Account, arn: result.Arn, userId: result.UserId, profile: config.awsProfile };
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
    elb: () => new ElasticLoadBalancingV2Client(clientConfig(region)).send(new DescribeLoadBalancersCommand({ PageSize: 100 })).then((r) => ({ items: (r.LoadBalancers ?? []).map((l) => ({ id: l.LoadBalancerArn, name: l.LoadBalancerName, state: l.State?.Code, vpcId: l.VpcId, scheme: l.Scheme })), truncated: Boolean(r.NextMarker) })),
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
  const [users, roles, summary, trails] = await Promise.all([
    aws.iam.send(new ListUsersCommand({ MaxItems: 100 })),
    aws.iam.send(new ListRolesCommand({ MaxItems: 100 })),
    aws.iam.send(new GetAccountSummaryCommand({})),
    new CloudTrailClient(clientConfig(region)).send(new DescribeTrailsCommand({ includeShadowTrails: true })),
  ]);
  const identities = await Promise.all((users.Users ?? []).map(async (u) => {
    const [mfa, attached, inline] = await Promise.all([
      aws.iam.send(new ListMFADevicesCommand({ UserName: u.UserName })),
      aws.iam.send(new ListAttachedUserPoliciesCommand({ UserName: u.UserName })),
      aws.iam.send(new ListUserPoliciesCommand({ UserName: u.UserName })),
    ]);
    return { name: u.UserName, arn: u.Arn, createdAt: u.CreateDate?.toISOString(), mfa: (mfa.MFADevices?.length ?? 0) > 0,
      policies: [...(attached.AttachedPolicies ?? []).map((p) => p.PolicyName ?? ''), ...(inline.PolicyNames ?? [])].filter(Boolean) };
  }));
  const mappedRoles = await Promise.all((roles.Roles ?? []).map(async (r) => {
    const [attached, inline] = await Promise.all([
      aws.iam.send(new ListAttachedRolePoliciesCommand({ RoleName: r.RoleName })),
      aws.iam.send(new ListRolePoliciesCommand({ RoleName: r.RoleName })),
    ]);
    return { name: r.RoleName, arn: r.Arn, createdAt: r.CreateDate?.toISOString(),
      policies: [...(attached.AttachedPolicies ?? []).map((p) => p.PolicyName ?? ''), ...(inline.PolicyNames ?? [])].filter(Boolean) };
  }));
  let findings: { id?: string; title?: string; severity?: string; status?: string }[] = [];
  let findingsError: string | null = null;
  try {
    const response = await new SecurityHubClient(clientConfig(region)).send(new GetFindingsCommand({ MaxResults: 50 }));
    findings = (response.Findings ?? []).map((f) => ({ id: f.Id, title: f.Title, severity: f.Severity?.Label, status: f.Workflow?.Status }));
  } catch (error) { findingsError = awsError(error); }
  const trailStatuses = await Promise.all((trails.trailList ?? []).map(async (trail) => {
    try {
      const status = await new CloudTrailClient(clientConfig(region)).send(new GetTrailStatusCommand({ Name: trail.TrailARN ?? trail.Name }));
      return { name: trail.Name, arn: trail.TrailARN, multiRegion: trail.IsMultiRegionTrail, logFileValidation: trail.LogFileValidationEnabled, isLogging: status.IsLogging };
    } catch { return { name: trail.Name, arn: trail.TrailARN, multiRegion: trail.IsMultiRegionTrail, logFileValidation: trail.LogFileValidationEnabled, isLogging: null }; }
  }));
  return {
    accountSummary: summary.SummaryMap ?? {}, identities,
    roles: mappedRoles,
    trails: trailStatuses,
    findings, findingsError, truncated: Boolean(users.IsTruncated || roles.IsTruncated),
  };
}

export async function simulatePolicy(principalArn: string, action: string, resourceArn: string) {
  const result = await aws.iam.send(new SimulatePrincipalPolicyCommand({
    PolicySourceArn: principalArn, ActionNames: [action], ResourceArns: [resourceArn],
  }));
  return (result.EvaluationResults ?? []).map((r) => ({ action: r.EvalActionName, resource: r.EvalResourceName, decision: r.EvalDecision, missingContext: r.MissingContextValues ?? [] }));
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
