# DevTracker — Teams & Invitations API Documentation

This document specifies all the HTTP endpoints and Socket.io events related to **Teams** and **Invitations** in the DevTracker system. Use this as the reference to integrate the frontend with the backend APIs.

---

## ── General Configuration & Authentication ──

*   **Base URL (Local Dev)**: `http://localhost:3000`
*   **Base URL (Production)**: `https://dev-tracker-api-five.vercel.app`
*   **Authentication**: All endpoints below require a valid JWT. The API expects the token in the `token` cookie (HttpOnly cookie forwarded automatically by browser) or via standard auth headers.
*   **Response Format**: All success responses follow the format:
    ```json
    {
      "status": "success",
      "data": { ... }
    }
    ```
    All error responses follow the standard error middleware structure:
    ```json
    {
      "status": "fail" | "error",
      "message": "Human readable error description"
    }
    ```

---

## ── 1. Teams Endpoints (`/api/teams`) ──

### 1.1 Fetch User's Teams
Retrieve all teams where the authenticated user is either the **Owner** (created by the user) or a **Member** (joined via invitation).

*   **HTTP Method**: `GET`
*   **Path**: `/api/teams/my-teams`
*   **Headers**: Requires authentication cookies/token.
*   **Query Parameters**: None.
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "results": 2,
      "data": {
        "ownedTeams": [
          {
            "_id": "64b73c4f923b0923ec18a75e",
            "name": "Jane Doe's Team",
            "description": "Primary development workspace",
            "category": "general",
            "isActive": true,
            "owner": {
              "_id": "64b73c4f923b0923ec18a75e",
              "name": "Jane Doe",
              "email": "jane.doe@example.com"
            },
            "members": [
              {
                "_id": "64b82d49a0b9381c8ef12a32",
                "name": "John Developer",
                "email": "john.dev@example.com"
              }
            ],
            "createdAt": "2026-07-10T12:00:00.000Z",
            "updatedAt": "2026-07-16T10:00:00.000Z"
          }
        ],
        "memberTeams": [
          {
            "_id": "64ab1e389e11bc29a8d9a473",
            "name": "Alice Smith's Team",
            "description": "Collaborator workspace",
            "category": "general",
            "isActive": true,
            "owner": {
              "_id": "64ab1e389e11bc29a8d9a473",
              "name": "Alice Smith",
              "email": "alice@example.com"
            },
            "members": [
              {
                "_id": "64b73c4f923b0923ec18a75e",
                "name": "Jane Doe",
                "email": "jane.doe@example.com"
              }
            ],
            "createdAt": "2026-07-12T08:30:00.000Z",
            "updatedAt": "2026-07-16T10:00:00.000Z"
          }
        ]
      }
    }
    ```

### 1.2 Create a New Team (Placeholder)
In DevTracker's database schema, teams are implicitly managed. Sending invitations automatically aggregates team associations. Therefore, calling this endpoint returns a validation error.

*   **HTTP Method**: `POST`
*   **Path**: `/api/teams`
*   **Body Parameters**:
    ```json
    {
      "name": "Team Name",
      "description": "Optional description",
      "category": "Optional category"
    }
    ```
*   **Error Response (400 Bad Request)**:
    ```json
    {
      "status": "fail",
      "message": "In this workspace, teams are automatically created when you send and accept invitations."
    }
    ```

---

## ── 2. Invitations Endpoints (`/invitations`) ──

### 2.1 Send Invitation / Share Projects
Sends an invite to a developer by email. Optionally binds access to specific projects. 

> [!IMPORTANT]
> **IDOR Guard & Plan-Limit validation**:
> * **Ownership Check**: The server enforces that the sender owns all project IDs passed in `sharedProjects`.
> * **Plan-Limit Gate**: Free-tier invitees are capped at a maximum of **3 shared projects**. If the invite exceeds this limit, the request fails with a `422 Unprocessable Entity` status code, and the invitee gets an in-app socket alert suggesting they upgrade to PRO.

*   **HTTP Method**: `POST`
*   **Path**: `/invitations/sendinvitaions`
*   **Body Parameters**:
    ```json
    {
      "email": "recipient@example.com",
      "sharedProjects": ["64b63e8a4a39031c9bf88d44"] 
    }
    ```
    *(Note: Pass an empty array `[]` or omit `sharedProjects` for team-only invites with no initial project access.)*

*   **Success Response (201 Created)**:
    ```json
    {
      "status": "success",
      "message": "Invitation sent successfully. The developer will see it in their dashboard.",
      "data": {
        "invitation": {
          "_id": "64c910b471c9ba3ef123ad99",
          "sender": "64b73c4f923b0923ec18a75e",
          "recipientEmail": "recipient@example.com",
          "sharedProjects": ["64b63e8a4a39031c9bf88d44"],
          "status": "pending",
          "createdAt": "2026-07-16T10:20:00.000Z"
        }
      }
    }
    ```

*   **Possible Errors**:
    *   `400 Bad Request`: "You cannot send an invitation to yourself" or "This developer is already in your team" or "An invitation is already pending for this developer".
    *   `403 Forbidden`: "One or more selected projects do not belong to you or are archived."
    *   `404 Not Found`: "Cannot find user with this email".
    *   `422 Unprocessable Entity`: "The invitee has reached the FREE plan limit (3 projects). They currently control X project(s). Ask them to upgrade to PRO or share fewer projects."

---

### 2.2 Get Admin's Projects (for Selector Modal)
Returns the active, non-archived projects owned by the logged-in admin. Use this to populate the multi-select dropdown in the "Invite Team Member" modal.

*   **HTTP Method**: `GET`
*   **Path**: `/invitations/my-projects`
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "results": 2,
      "data": {
        "projects": [
          {
            "_id": "64b63e8a4a39031c9bf88d44",
            "name": "E-Commerce App",
            "status": "active"
          },
          {
            "_id": "64b63f2b4a39031c9bf88d92",
            "name": "DevTracker Dashboard",
            "status": "active"
          }
        ]
      }
    }
    ```

---

### 2.3 Get Developer's Received Invitations
Fetch all pending invitations received by the currently logged-in developer.

*   **HTTP Method**: `GET`
*   **Path**: `/invitations/getallinetations`
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "results": 1,
      "data": {
        "invitations": [
          {
            "_id": "64c910b471c9ba3ef123ad99",
            "sender": {
              "_id": "64b73c4f923b0923ec18a75e",
              "name": "Jane Doe",
              "email": "jane.doe@example.com"
            },
            "recipientEmail": "recipient@example.com",
            "sharedProjects": [
              {
                "_id": "64b63e8a4a39031c9bf88d44",
                "name": "E-Commerce App"
              }
            ],
            "status": "pending",
            "createdAt": "2026-07-16T10:20:00.000Z"
          }
        ]
      }
    }
    ```

---

### 2.4 Respond to Invitation
Accept or decline an invitation. Accepting adds the caller to the sender's team database record.

*   **HTTP Method**: `POST`
*   **Path**: `/invitations/respond/:invitationId`
*   **URL Parameter**: `invitationId` (the MongoDB ID of the invitation)
*   **Body Parameters**:
    ```json
    {
      "decision": "accept" // or "reject"
    }
    ```
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "message": "Invitation accepted. You are now part of the team!"
    }
    ```
    *or*
    ```json
    {
      "status": "success",
      "message": "Invitation rejected."
    }
    ```

---

## ── 3. Team Member Management ──

### 3.1 Get Team Members
Retrieve all team members joined under the requesting admin's workspace.

*   **HTTP Method**: `GET`
*   **Path**: `/invitations/members`
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "results": 1,
      "data": {
        "members": [
          {
            "id": "64b82d49a0b9381c8ef12a32",
            "name": "John Developer",
            "email": "john.dev@example.com",
            "joinedAt": "2026-07-16T10:25:00.000Z",
            "permissions": {
              "canCreateProjects": false,
              "canEditProjects": false,
              "canDeleteProjects": false,
              "canManageTasks": true,
              "canSeeFinancials": false
            }
          }
        ]
      }
    }
    ```

---

### 3.2 Remove Team Member
Remove a developer from your team. This will revoke their access to your projects and dashboard.

*   **HTTP Method**: `DELETE`
*   **Path**: `/invitations/members/:memberId`
*   **URL Parameter**: `memberId` (the user ID of the developer to remove)
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "message": "Member removed successfully from your team"
    }
    ```

---

### 3.3 Update Member Permissions
Allows the team owner (admin) to fine-tune individual access flags for a member.

*   **HTTP Method**: `PATCH`
*   **Path**: `/invitations/members/:memberId/permissions`
*   **URL Parameter**: `memberId` (the user ID of the developer)
*   **Body Parameters**:
    ```json
    {
      "key": "canManageTasks", 
      "value": true
    }
    ```
    *Allowed keys:* `["canCreateProjects", "canEditProjects", "canDeleteProjects", "canManageTasks", "canSeeFinancials"]`
*   **Success Response (200 OK)**:
    ```json
    {
      "status": "success",
      "message": "Permission updated successfully",
      "data": {
        "updatedPermission": {
          "canManageTasks": true
        }
      }
    }
    ```

---

## ── 4. Socket.io Real-Time Event Handlers ──

The backend publishes the following WebSocket events to target clients to keep the frontend updated in real-time. Ensure Socket.io connections authenticate with user tokens.

| Event Name | Recipient | Payload | Trigger |
| :--- | :--- | :--- | :--- |
| `new_invitation` | Invited Developer | `{ message, invitationId, senderName, sharedProjectCount, sentAt }` | Triggered when an admin sends a new invitation. |
| `invitation_accepted` | Admin (Sender) | `{ developerName, developerId, message }` | Triggered when the developer accepts the invite. |
| `invitation_rejected` | Admin (Sender) | `{ developerEmail, message }` | Triggered when the developer rejects the invite. |
| `removed_from_team` | Developer | `{ message, adminId }` | Triggered when the admin removes the developer from the team. |
| `permissions_updated` | Developer | `{ adminId, updatedKey, newValue, message }` | Triggered when the admin edits the developer's permissions. |
| `project_limit_exceeded` | Developer | `{ adminName, currentCount, limit, message }` | Fired when an admin attempts to share projects that exceed the invitee's Free project limit (cap of 3). |

---

## ── 5. Frontend Integration Models (TypeScript) ──

Frontend developers can drop these models directly into their code:

```typescript
export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Team {
  _id: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  owner: TeamMember;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface MyTeamsResponse {
  status: 'success';
  results: number;
  data: {
    ownedTeams: Team[];
    memberTeams: Team[];
  };
}

export interface Invitation {
  _id: string;
  sender: TeamMember | string;
  recipientEmail: string;
  sharedProjects?: Array<{ _id: string; name: string }>;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ProjectSelectorItem {
  _id: string;
  name: string;
  status: string;
}
```
