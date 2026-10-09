// API burst: start executions at a constant arrival rate and watch latency and errors.
// Not run in CI. Needs a running stack and a valid access token (docs/testing/load.md):
//   k6 run -e BASE_URL=http://localhost:3000 -e TOKEN=... -e ORG_ID=... -e WORKFLOW_ID=... \
//     tests/load/start-execution.k6.js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const TOKEN = __ENV.TOKEN;
const ORG_ID = __ENV.ORG_ID;
const WORKFLOW_ID = __ENV.WORKFLOW_ID;

export const options = {
  scenarios: {
    burst: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE ?? 50),
      timeUnit: '1s',
      duration: __ENV.DURATION ?? '1m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  // Starting points; calibrate against measured baselines before enforcing them anywhere.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
  },
};

export default function () {
  const response = http.post(
    `${BASE_URL}/api/v1/organizations/${ORG_ID}/workflows/${WORKFLOW_ID}/executions`,
    JSON.stringify({ input: { source: 'k6' } }),
    {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        // A fresh key per iteration: every request creates an execution.
        'idempotency-key': `k6-${__VU}-${__ITER}-${Date.now()}`,
      },
    },
  );
  check(response, { created: (r) => r.status === 201 });
}
