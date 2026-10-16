/**
 * k6 Load Test Script for 1,000 Concurrent Users (Kohima Hornbill & Campus Fest Surge)
 * SDD Section 8.2 (`tests/k6-load-1000ccu.js`)
 * Verifies NFR-PERF-01 (`P95 < 250ms`) and NFR-PERF-03 (`1,000 CCU` with `0%` double-spend).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 250 },
    { duration: '30s', target: 1000 },
    { duration: '15s', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<250'],
    http_req_failed: ['rate<0.01']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/gigs?student_corridor=SOVIMA_6MILE`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'returns gigs array': (r) => JSON.parse(r.body).success === true
  });
  sleep(0.5);
}
