# GitHub Integration API Documentation

This document outlines the API endpoints, authentication flows, and webhook handling implemented for the GitHub Integration and the 30-Day Pro Trial feature.

## Base URL
Prefix all standard GitHub module routes with `/developer` or `/github` depending on your `app.js` mount point. Based on current config, auth routes are mounted at `/auth` and API routes at `/github`.

---

## 1. OAuth 2.0 Flow (Agent 1)

These routes handle the initial connection to GitHub using a stateless JWT-in-state pattern.

### `GET /auth/github`
Redirects the user to the GitHub OAuth consent screen.
*   **Query Parameters:**
    *   `token` (required): The current DevTracker user's JWT. We embed this as the OAuth `state` parameter to prevent CSRF and identify the user upon return.
*   **Response:** `302 Found` (Redirects to `https://github.com/login/oauth/authorize...`)

### `GET /auth/github/callback`
The callback URL GitHub redirects to after the user grants/denies permission.
*   **Query Parameters (from GitHub):**
    *   `code`: The short-lived OAuth exchange code.
    *   `state`: The DevTracker JWT passed in the initial step.
    *   `error`: Present if the user denied access.
*   **Action:** Validates the JWT, exchanges the code for an AES-256-GCM encrypted access token, links the GitHub account to the Developer, and starts the 30-day Pro trial (if applicable).
*   **Response:** `302 Found` (Redirects to your Angular frontend URL defined by `FRONTEND_GITHUB_SUCCESS_URL` with query params `trialStarted`, `githubLogin`, and `proTrialEndDate`).

---

## 2. API Endpoints (Agents 2 & 3)

All these endpoints are mounted at `/github` and **require authentication (`protect` middleware)**. Some also require an active Pro trial or subscription (`requireProAccess` middleware).

### `POST /github/link`
An alternative to the redirect flow: links a GitHub account if the frontend handles the OAuth popup natively and just sends the code to the backend.
*   **Middleware:** `protect`
*   **Body:**
    ```json
    { "code": "github_oauth_code" }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "GitHub account linked! Your 30-day Pro trial has started.",
      "data": {
        "githubLogin": "johndoe",
        "trialStarted": true,
        "proTrialEndDate": "2026-05-10T14:46:00.000Z"
      }
    }
    ```

### `GET /github/trial-status`
Retrieves the current status of the user's Pro trial for UI rendering (e.g., banner).
*   **Middleware:** `protect`
*   **Response (200 OK):**
    ```json
    {
      "message": "Trial status retrieved.",
      "data": {
        "isPro": false,
        "githubLinked": true,
        "githubLogin": "johndoe",
        "active": true,
        "daysRemaining": 30,
        "endsAt": "2026-05-10T14:46:00.000Z"
      }
    }
    ```

### `GET /github/repos`
Fetches a list of repositories owned by the linked GitHub account. Uses an in-memory 5-minute cache to respect GitHub API rate limits.
*   **Middleware:** `protect`, `requireProAccess`
*   **Response (200 OK):**
    ```json
    {
      "message": "Repositories fetched successfully.",
      "count": 2,
      "data": [
        {
          "repoId": 123456789,
          "name": "dev-tracker",
          "fullName": "johndoe/dev-tracker",
          "private": false,
          "htmlUrl": "https://github.com/johndoe/dev-tracker",
          "description": "Project tracker app",
          "language": "TypeScript",
          "stars": 42,
          "updatedAt": "2026-04-10T10:00:00Z"
        }
      ]
    }
    ```

### `POST /github/select-repos`
Persists the user's selected repositories into DevTracker (`developer.github.linkedRepos`). Resets the list with the provided array.
*   **Middleware:** `protect`, `requireProAccess`
*   **Body:**
    ```json
    {
      "repos": [
        {
          "repoId": 123456789,
          "name": "dev-tracker",
          "fullName": "johndoe/dev-tracker",
          "private": false,
          "htmlUrl": "https://github.com/...",
          "language": "TypeScript"
        }
      ]
    }
    ```
*   **Response (200 OK):** Let's you know the repositories were saved to the user profile successfully.

---

## 3. Webhooks

### `POST /github/webhooks/github`
Receives Server-to-Server events pushed directly by GitHub. Designed to bypass the user JWT requirement.
*   **Security:** Uses HMAC SHA-256 validation against `GITHUB_WEBHOOK_SECRET`.
*   **Headers Expected:**
    *   `x-github-event` (e.g., `push`)
    *   `x-hub-signature-256` (HMAC signature)
*   **Action:** Safely reads the payload, determines the repository and commits, maps it back to the DevTracker Developer instance, and parses it securely into a Developer Activity stream.
*   **Response:** `200 OK` ("Webhook received and processed") or `401 Unauthorized` if signatures do not match.

---

## 4. Error Formats

If an endpoint is protected by `requireProAccess` and the user's trial has expired (and they aren't a paying subscriber), the API returns a structured `403 Forbidden` response to power the UI banners:

```json
{
  "error": "trial_expired",
  "message": "Your Pro trial has expired. Please upgrade to continue using GitHub features.",
  "remainingDays": 0,
  "endsAt": "2026-04-10T14:46:00.000Z"
}
```
If GitHub isn't linked yet:
```json
{
  "error": "github_not_linked",
  "message": "Link your GitHub account to activate your free 30-day Pro trial.",
  "remainingDays": 0,
  "endsAt": null
}
```
