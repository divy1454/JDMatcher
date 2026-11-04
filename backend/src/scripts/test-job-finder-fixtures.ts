/** Sample API responses shaped like each provider's documented output. Dates are relative to NOW. */
export const NOW = new Date('2026-11-04T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

export const JSEARCH = {
  status: 'OK',
  data: [
    {
      job_id: 'js-1',
      employer_name: 'AcmeCloud Inc',
      job_publisher: 'Dice',
      job_title: 'DevOps Engineer',
      job_apply_link: 'https://www.dice.com/job-detail/abc',
      apply_options: [
        { publisher: 'Dice', apply_link: 'https://www.dice.com/job-detail/abc', is_direct: false },
        { publisher: 'LinkedIn', apply_link: 'https://www.linkedin.com/jobs/view/4123', is_direct: false },
      ],
      job_description:
        'DevOps Engineer - 12 months contract. Rate: $65/hr on C2C. Visa: USC/GC/H1B. Hybrid role, 3 days a week in office in Austin, TX. Must have Kubernetes, Terraform, AWS, Jenkins.',
      job_is_remote: false,
      job_posted_at_datetime_utc: hoursAgo(5),
      job_city: 'Austin',
      job_state: 'TX',
      job_country: 'US',
      job_location: 'Austin, TX',
      job_employment_type: 'Contractor',
    },
    {
      job_id: 'js-2',
      employer_name: 'Lone Star Bank',
      job_publisher: 'LinkedIn',
      job_title: 'Senior DevOps Engineer',
      job_apply_link: 'https://www.linkedin.com/jobs/view/5555',
      apply_options: [],
      job_description: 'W2 only. No C2C. USC/GC only. Kubernetes, Terraform, AWS, Python. Onsite 5 days in Dallas, TX.',
      job_is_remote: false,
      job_posted_at_datetime_utc: hoursAgo(20),
      job_location: 'Dallas, TX',
      job_employment_type: 'Contractor',
    },
    {
      job_id: 'js-3',
      employer_name: 'StreamCo',
      job_publisher: 'Indeed',
      job_title: 'Site Reliability Engineer (Remote)',
      job_apply_link: 'https://www.indeed.com/viewjob?jk=777',
      apply_options: [],
      job_description: '100% remote. Kubernetes, Prometheus, Grafana, AWS, Go. We are able to sponsor H-1B transfers.',
      job_is_remote: true,
      job_posted_at_datetime_utc: hoursAgo(40),
      job_location: 'United States',
      job_employment_type: 'Full-time',
    },
    {
      job_id: 'js-4',
      employer_name: 'GlobalSoft',
      job_publisher: 'LinkedIn',
      job_title: 'DevOps Engineer',
      job_apply_link: 'https://www.linkedin.com/jobs/view/9999',
      apply_options: [],
      job_description: 'Kubernetes and Terraform in Bengaluru.',
      job_is_remote: false,
      job_posted_at_datetime_utc: hoursAgo(10),
      job_location: 'Bengaluru, Karnataka, India',
      job_employment_type: 'Full-time',
    },
    {
      job_id: 'js-5',
      employer_name: 'OldCo',
      job_publisher: 'ZipRecruiter',
      job_title: 'DevOps Engineer',
      job_apply_link: 'https://www.ziprecruiter.com/jobs/old',
      apply_options: [],
      job_description: 'Kubernetes. Posted a while ago.',
      job_is_remote: false,
      job_posted_at_datetime_utc: hoursAgo(24 * 12),
      job_location: 'Houston, TX',
      job_employment_type: 'Contractor',
    },
  ],
};

const GH_JOBS = [
    {
      id: 101,
      title: 'DevOps Engineer',
      company_name: 'AcmeCloud',
      location: { name: 'Austin, TX' },
      absolute_url: 'https://boards.greenhouse.io/acmecloud/jobs/101',
      updated_at: hoursAgo(30),
      first_published: hoursAgo(6),
      content: '&lt;p&gt;Run our &lt;strong&gt;Kubernetes&lt;/strong&gt; platform with Terraform and AWS.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Hybrid role in Austin&lt;/li&gt;&lt;/ul&gt;',
    },
    {
      id: 102,
      title: 'Account Executive',
      location: { name: 'Austin, TX' },
      absolute_url: 'https://boards.greenhouse.io/acmecloud/jobs/102',
      updated_at: hoursAgo(5),
      content: '&lt;p&gt;Sell things.&lt;/p&gt;',
    },
    {
      id: 103,
      title: 'Platform Engineer, Kubernetes',
      location: { name: 'Remote - US' },
      absolute_url: 'https://boards.greenhouse.io/acmecloud/jobs/103',
      updated_at: hoursAgo(50),
      content: '&lt;p&gt;Fully remote. Kubernetes, Helm, ArgoCD, AWS. We do not sponsor visas.&lt;/p&gt;',
    },
];
/** Greenhouse list endpoint (no descriptions) and the per-job endpoint (with content). */
export const GREENHOUSE = { jobs: GH_JOBS.map(({ content, ...rest }) => rest) };
export const GREENHOUSE_DETAIL: Record<string, unknown> = Object.fromEntries(GH_JOBS.map((j) => [String(j.id), j]));

export const LEVER = [
  {
    id: 'lv-1',
    text: 'Cloud Infrastructure Engineer (Contract)',
    categories: { location: 'Remote', commitment: 'Contract', team: 'Infra' },
    workplaceType: 'remote',
    createdAt: Date.parse(hoursAgo(28)),
    hostedUrl: 'https://jobs.lever.co/brightpath/lv-1',
    applyUrl: 'https://jobs.lever.co/brightpath/lv-1/apply',
    descriptionPlain: '6 months contract with possible extension. Terraform, AWS, Kubernetes, Python.',
    lists: [{ text: 'Requirements', content: '<li>Visa: USC/GC/H1B/EAD</li>' }],
    additionalPlain: '',
  },
];

export const WORKDAY_LIST = {
  total: 2,
  jobPostings: [
    { title: 'Sr. DevOps Engineer', externalPath: '/job/Plano-TX/Sr-DevOps-Engineer_R1001', locationsText: 'Plano, TX', postedOn: 'Posted Today', bulletFields: ['R1001'] },
    { title: 'Payroll Specialist', externalPath: '/job/Plano-TX/Payroll-Specialist_R1002', locationsText: 'Plano, TX', postedOn: 'Posted Today', bulletFields: ['R1002'] },
  ],
};
export const WORKDAY_DETAIL = {
  jobPostingInfo: {
    title: 'Sr. DevOps Engineer',
    jobDescription: '<p>Support defense programs. <b>Active Secret clearance required.</b> Kubernetes, Ansible, AWS GovCloud.</p>',
    location: 'Plano, TX',
    additionalLocations: ['US, TX, Austin'],
    timeType: 'Full time',
    startDate: hoursAgo(8).slice(0, 10),
    externalUrl: 'https://defenseco.wd5.myworkdayjobs.com/External/job/Plano-TX/Sr-DevOps-Engineer_R1001',
  },
};

export const SMARTRECRUITERS_LIST = {
  content: [
    {
      id: 'sr-1',
      name: 'Site Reliability Engineer',
      releasedDate: hoursAgo(12),
      location: { city: 'Charlotte', region: 'NC', country: 'us', remote: false },
      typeOfEmployment: { label: 'Full-time' },
      company: { name: 'Carolina Health' },
    },
  ],
};
export const SMARTRECRUITERS_DETAIL = {
  jobAd: { sections: { jobDescription: { text: '<p>Observability, Kubernetes, Terraform. Locals only.</p>' }, qualifications: { text: '<p>AWS</p>' } } },
};

export const ADZUNA = {
  results: [
    {
      id: 'az-1',
      title: '<strong>DevOps</strong> Engineer',
      company: { display_name: 'Midwest Retail' },
      location: { display_name: 'Chicago, Cook County' },
      description: 'Contract role. Corp-to-corp is fine. Kubernetes and Azure DevOps...',
      created: hoursAgo(30),
      redirect_url: 'https://www.adzuna.com/details/az-1',
      contract_type: 'contract',
      contract_time: 'full_time',
    },
  ],
};

/** A Lever board for a Java candidate with healthcare background (ordering, industry, hiding rules). */
const minsAgo = (m: number) => NOW.getTime() - m * 60000;
const lever = (id: string, text: string, mins: number, body: string, commitment = 'Contract') => ({
  id,
  text,
  categories: { location: 'Remote', commitment },
  workplaceType: 'remote',
  createdAt: minsAgo(mins),
  hostedUrl: `https://jobs.lever.co/medtechpartners/${id}`,
  applyUrl: `https://jobs.lever.co/medtechpartners/${id}/apply`,
  descriptionPlain: body,
  lists: [],
  additionalPlain: 'We offer medical, dental and vision insurance, 401(k) and paid time off.',
});
export const LEVER_JAVA = [
  lever('hc-1', 'Senior Java Developer', 180, '12 months contract, C2C OK. Build HIPAA-compliant claims adjudication services for a health plan: Java 17, Spring Boot, microservices, Kafka, AWS. EHR integration a plus.'),
  lever('bank-1', 'Java Developer', 60, 'Contract role for a core banking platform: payments, AML/KYC. Java, Spring Boot, microservices, Oracle SQL.'),
  lever('hc-2', 'Software Engineer', 120, 'Contract. Our patient engagement platform exchanges HL7 and FHIR data with hospitals. Stack: Java, Spring Boot, REST APIs, PostgreSQL.'),
  lever('fs-1', 'Senior Full-Stack Engineer', 30, 'Contract. React, Node.js, TypeScript and GraphQL for our patient portal and scheduling tools.'),
  lever('usc-1', 'Java Developer', 240, 'Contract. Java, Spring Boot, microservices. US Citizens only due to a federal contract.'),
  lever('clr-1', 'Java Backend Developer', 300, 'Contract. Java, Spring Boot. Must be able to obtain a Secret clearance.'),
  lever('w2-1', 'Java Developer', 360, 'W2 only, no C2C. Java, Spring Boot, microservices for a hospital network: HIPAA, EHR integration and patient scheduling.'),
  lever('old-1', 'Java Developer', 40 * 60, 'Contract. Java, Spring Boot, microservices.'),
];
