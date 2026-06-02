# KORNIX Frontend Smoke Testing

## Preconditions

- Backend API is running at `http://localhost:8001`
- Frontend is running at `http://localhost:5173`
- `.env.integration.example` is used for dev frontend

## API Smoke

- `GET http://localhost:8001/api/v1/me`
- `GET http://localhost:8001/api/v2/kornix/current-context`
- `GET http://localhost:8001/api/v2/kornix/irrigation-layer/current`
- Map endpoint with `currentAppliedCalculationRunId + methodCode`
- Profile endpoint with `currentAppliedCalculationRunId + methodCode`
- Approval submit and polling

## Browser Smoke

- Open `http://localhost:5173/map`
- Confirm network requests target `http://localhost:8001`
- Confirm selected method is `simple_eto_single_layer_soil`
- Confirm map/profile render
- Open irrigation tab and confirm active layer is visible
- Change one positive irrigation value inside managed scope
- Submit approval and wait for polling to finish
- Confirm map/profile refresh after applied calculation run

## Negative Checks

- No `/api/v1/kornix/*` requests
- No `/api/admin/v1` requests
- `0 мм` is not submitted
- Values outside `managedScope` are not editable or submitted
