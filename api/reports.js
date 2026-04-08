const API_KEY = process.env.CROWN_GHL_API_KEY;
const LOCATION_ID = process.env.CROWN_GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

// Pipeline IDs
const ELECTRICAL_PIPELINE = 'pU3FYb5WdrX0xIommyYo'; // Main roofing pipeline
const SALES_PIPELINE = '305z1z0jxt5FcMDxJY7Q';

// Stage mappings for Electrical/Roofing pipeline
const STAGES = {
  newLead: '71f66fe4-2590-442b-8a3f-1a8c8b9b139a',
  assessment: '45aa6126-a28b-43e3-8c63-7cff8696f0f2',
  siteVisit: 'c72191af-b286-4657-948d-c240af5d5952',
  estimate: '0075a66e-bed0-4e25-8db4-9c5472a9ee32',
  contract: '7c2843c7-2fc3-49ee-831e-c1cdddd0aa7e',
  workExecution: 'd632b873-6a1d-409b-bfb6-9e02d3753594',
  completion: '6fd1b017-ab2a-434c-9c63-ce4d0d8cdce8',
  invoicing: '5b95e653-5c3d-4a0c-ba98-024c9ccbf738',
  followUp: 'f4a4bdd0-874b-45ff-8e06-2113de403c48',
  reviewRequest: '8a594338-243b-43e5-8836-1a498b69cf92',
};

// Sales pipeline stages
const SALES_STAGES = {
  optIn: '4a5c3ebe-fe11-4e94-a136-24148529e03a',
  apptSet: '2c099acd-d7bf-4975-8b51-dbb33e13c857',
  cancellation: '154084a0-369a-4f6c-978a-dbc1629b6783',
  noShow: '3e08a93b-cc5b-4c01-b553-a0c6782c5678',
};

function getDateRange(period) {
  const now = new Date();
  const end = now.toISOString();
  let start;

  switch (period) {
    case 'day':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      start = d.toISOString();
      break;
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      start = d.toISOString();
      break;
    }
    case 'quarter': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      start = d.toISOString();
      break;
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      start = d.toISOString();
      break;
    }
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  return { start, end };
}

async function fetchAllOpportunities(pipelineId, startDate, endDate) {
  let all = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const body = { locationId: LOCATION_ID, limit: 100, page };
    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    const res = await fetch(`${BASE}/opportunities/search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const opps = data.opportunities || [];
    all = all.concat(opps);

    if (opps.length < 100 || all.length >= data.total) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return all;
}

async function fetchContacts(startDate, endDate) {
  let all = [];
  let startAfterId = null;
  let hasMore = true;

  while (hasMore) {
    let url = `${BASE}/contacts/?locationId=${LOCATION_ID}&limit=100`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;

    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    const contacts = data.contacts || [];
    all = all.concat(contacts);

    if (contacts.length < 100) {
      hasMore = false;
    } else {
      startAfterId = contacts[contacts.length - 1].id;
    }

    // Safety limit
    if (all.length > 5000) break;
  }

  return all;
}

function computeMetrics(opportunities, contacts) {
  const metrics = {
    // Pipeline stages
    newLeads: 0,
    assessment: 0,
    siteVisits: 0,
    estimates: 0,
    contractsSigned: 0,
    jobsInProgress: 0,
    completedJobs: 0,
    invoiced: 0,
    followUps: 0,
    reviewRequests: 0,

    // Sales pipeline
    optIns: 0,
    appointmentsSet: 0,
    cancellations: 0,
    noShows: 0,

    // Financial
    totalRevenue: 0,
    avgDealValue: 0,
    pipelineValue: 0,

    // Contacts
    totalContacts: contacts.length,
    leadsNotContacted: 0,

    // Derived
    closeRate: 0,
    showRate: 0,
    bookingRate: 0,

    // Stage breakdown for chart
    stageBreakdown: [],
  };

  const stageCountMap = {};

  for (const opp of opportunities) {
    const stageId = opp.pipelineStageId;
    const value = parseFloat(opp.monetaryValue) || 0;

    // Count by stage name
    const stageName = opp.pipelineStageId;
    stageCountMap[stageName] = (stageCountMap[stageName] || 0) + 1;

    // Roofing pipeline
    if (stageId === STAGES.newLead) metrics.newLeads++;
    else if (stageId === STAGES.assessment) metrics.assessment++;
    else if (stageId === STAGES.siteVisit) metrics.siteVisits++;
    else if (stageId === STAGES.estimate) metrics.estimates++;
    else if (stageId === STAGES.contract) { metrics.contractsSigned++; metrics.totalRevenue += value; }
    else if (stageId === STAGES.workExecution) { metrics.jobsInProgress++; metrics.pipelineValue += value; }
    else if (stageId === STAGES.completion) { metrics.completedJobs++; metrics.totalRevenue += value; }
    else if (stageId === STAGES.invoicing) { metrics.invoiced++; metrics.totalRevenue += value; }
    else if (stageId === STAGES.followUp) metrics.followUps++;
    else if (stageId === STAGES.reviewRequest) metrics.reviewRequests++;

    // Sales pipeline
    else if (stageId === SALES_STAGES.optIn) metrics.optIns++;
    else if (stageId === SALES_STAGES.apptSet) metrics.appointmentsSet++;
    else if (stageId === SALES_STAGES.cancellation) metrics.cancellations++;
    else if (stageId === SALES_STAGES.noShow) metrics.noShows++;
  }

  // Leads not contacted = contacts with no assignedTo and no tags
  metrics.leadsNotContacted = contacts.filter(c => !c.assignedTo && (!c.tags || c.tags.length === 0)).length;

  // Derived metrics
  const totalAppts = metrics.appointmentsSet + metrics.noShows + metrics.cancellations;
  const totalClosed = metrics.contractsSigned + metrics.completedJobs + metrics.invoiced;

  if (totalAppts > 0) {
    metrics.showRate = Math.round((metrics.appointmentsSet / totalAppts) * 100);
  }
  if (metrics.appointmentsSet > 0) {
    metrics.closeRate = Math.round((totalClosed / metrics.appointmentsSet) * 100);
  }
  const totalLeads = metrics.newLeads + metrics.optIns;
  if (totalLeads > 0) {
    metrics.bookingRate = Math.round((metrics.appointmentsSet / totalLeads) * 100);
  }
  if (totalClosed > 0) {
    metrics.avgDealValue = Math.round(metrics.totalRevenue / totalClosed);
  }

  // Pipeline value includes in-progress jobs
  metrics.pipelineValue += opportunities
    .filter(o => [STAGES.newLead, STAGES.assessment, STAGES.siteVisit, STAGES.estimate].includes(o.pipelineStageId))
    .reduce((sum, o) => sum + (parseFloat(o.monetaryValue) || 0), 0);

  // Stage breakdown for display
  metrics.stageBreakdown = [
    { name: 'New Leads', count: metrics.newLeads, color: '#dd201f' },
    { name: 'Assessment', count: metrics.assessment, color: '#f34140' },
    { name: 'Site Visits', count: metrics.siteVisits, color: '#79c7ff' },
    { name: 'Estimates', count: metrics.estimates, color: '#79c7ff' },
    { name: 'Contracts', count: metrics.contractsSigned, color: '#3DAA6A' },
    { name: 'In Progress', count: metrics.jobsInProgress, color: '#F5A623' },
    { name: 'Completed', count: metrics.completedJobs, color: '#3DAA6A' },
    { name: 'Invoiced', count: metrics.invoiced, color: '#3DAA6A' },
    { name: 'Follow-up', count: metrics.followUps, color: '#79c7ff' },
    { name: 'Review Requests', count: metrics.reviewRequests, color: '#dd201f' },
  ];

  return metrics;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!API_KEY || !LOCATION_ID) {
    return res.status(500).json({ error: 'Missing API credentials' });
  }

  try {
    const period = req.query.period || 'month';
    const { start, end } = getDateRange(period);

    const [opportunities, contacts] = await Promise.all([
      fetchAllOpportunities(null, start, end),
      fetchContacts(start, end),
    ]);

    const metrics = computeMetrics(opportunities, contacts);

    return res.status(200).json({
      period,
      dateRange: { start, end },
      metrics,
      raw: {
        totalOpportunities: opportunities.length,
        totalContacts: contacts.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
