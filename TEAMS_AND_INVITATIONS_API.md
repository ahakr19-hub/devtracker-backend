# DevTracker — Teams & Invitations System Architecture & API Documentation

This document serves as the master specification for **Teams** and **Invitations** in the DevTracker ecosystem. It details the underlying database architecture, security guardrails, HTTP APIs (including all success and error responses), real-time WebSocket events, and the frontend Angular integration pattern.

---

## 1. System & Database Architecture

DevTracker implements an optimized dual-model approach for managing team memberships.

### 1.1 Dual-Model Storage Strategy
*   **Stand-Alone `Team` Collection**: While a standalone `teams` collection exists, team memberships and structures are primarily managed via **embedded subdocuments** within the `Developer` collection. This design ensures that reading a developer's profile and memberships happens in a single, index-backed operation.
*   **Embedded `teams` Schema**: The membership lists are embedded inside `Developer.teams`. When a developer accepts an invitation from an admin, a new subdocument containing the admin's ID, join timestamp, and granular permission flags is pushed to their `teams` array.

---

### 1.2 Performance & Indexing Optimization
To prevent collection scans (`COLLSCAN`) at scale, the database features several production indexes:
*   **Developer Collection**:
    *   `{"teams.adminId": 1}`: Facilitates O(log N) lookups when fetching members belonging to a specific admin's team.
*   **Invitation Collection**:
    *   `{ sender: 1, recipientEmail: 1, status: 1 }`: A compound index to prevent duplicate invitations and support fast checks for existing pending invites.
    *   `{ sharedProjects: 1 }`: Multi-key index to query invitations containing a specific project.
    *   `{ recipientEmail: 1, sharedProjects: 1, status: 1 }`: Optimized index for real-time security guards and RBAC checks.

---

## 2. Business Logic & Security Gates

Managing teams involves two core security pillars enforced at the API controller and service layers:

### 2.1 IDOR Guard (Insecure Direct Object Reference)
Clients can specify project IDs when sending invitations or assigning projects to members. The backend never trusts client-provided IDs. An IDOR ownership guard verifies that every project ID is active (not archived) and belongs to the requesting admin:
```javascript
const adminOwnedProjects = await Project.find({
  _id: { $in: sharedProjectIds },
  owner: adminId,
  isArchived: false
});
```

### 2.2 Plan-Limit Gate (Free Tier Constraints)
DevTracker enforces project sharing restrictions based on the recipient's tier.
*   **Constraint**: Free-tier developers are capped at a maximum of **3 projects** (both owned projects and shared projects from all admins combined).
*   **Behavior**: When sharing projects with a developer on the Free plan, the system counts:
    1.  Projects owned by the developer.
    2.  Unique projects shared with the developer by *other* admins via accepted invitations.
*   **Result**: If the new assignment would push the user's project count past 3, the request is rejected with `422 Unprocessable Entity`. In addition, an asynchronous Socket.io event (`project_limit_exceeded`) notifies the developer to upgrade to PRO.

---

## 3. Database Schema Definitions

### 3.1 Developer Schema (Embedded Teams)
Located at: `src/modules/auth/schemas/developer.schema.js`
```javascript
teams: [{
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Developer"
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  permissions: {
    canCreateProjects: { type: Boolean, default: false },
    canEditProjects: { type: Boolean, default: false },
    canDeleteProjects: { type: Boolean, default: false },
    canManageTasks: { type: Boolean, default: false },
    canSeeFinancials: { type: Boolean, default: false }
  }
}]
```

### 3.2 Invitation Schema
Located at: `src/modules/auth/schemas/invitation.schema.js`
```javascript
{
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Developer",
    required: true,
    index: true,
  },
  recipientEmail: {
    type: String,
    required: [true, "Recipient email is required"],
    trim: true,
    lowercase: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  sharedProjects: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
  ],
  message: {
    type: String,
    trim: true,
    maxlength: 500,
  }
}
```

---

## 4. API Endpoint Reference

All endpoints below require a valid JWT token. The token is expected in the `token` cookie or the standard `Authorization` header.

### 4.1 Teams Endpoint (`/api/teams`)

#### GET `/api/teams/my-teams`
Retrieves all teams where the user is an owner or collaborator.

*   **Access**: Private
*   **Response (200 OK - Success)**:
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
                "email": "john.dev@example.com",
                "sharedProjects": ["64b63e8a4a39031c9bf88d44"]
              }
            ],
            "createdAt": "2026-07-16T10:00:00.000Z",
            "updatedAt": "2026-07-16T10:00:00.000Z"
          }
        ],
        "memberTeams": [
          {
            "_id": "64c81d39a0b9381c8ef12a10",
            "name": "Alice Smith's Team",
            "description": "Collaborator workspace",
            "category": "general",
            "isActive": true,
            "owner": {
              "_id": "64c81d39a0b9381c8ef12a10",
              "name": "Alice Smith",
              "email": "alice.smith@example.com"
            },
            "members": [
              {
                "_id": "64b73c4f923b0923ec18a75e",
                "name": "Jane Doe",
                "email": "jane.doe@example.com"
              }
            ],
            "createdAt": "2026-07-17T12:00:00.000Z",
            "updatedAt": "2026-07-17T12:00:00.000Z"
          }
        ]
      }
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "You are not logged in. Please log in to get access."
    }
    ```

#### POST `/api/teams`
Placeholder endpoint.
*   **Request Body**:
    ```json
    {
      "name": "Beta Team",
      "description": "New team for backend tracking",
      "category": "engineering"
    }
    ```
*   **Response (400 Bad Request)**:
    ```json
    {
      "status": "fail",
      "message": "In this workspace, teams are automatically created when you send and accept invitations."
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "You are not logged in. Please log in to get access."
    }
    ```

---

### 4.2 Invitations & Member Management (`/invitations`)

#### POST `/invitations/sendinvitaions`
Invites a developer and shares projects.
*   **Request Body**:
    ```json
    {
      "email": "developer@example.com",
      "sharedProjects": ["64b63e8a4a39031c9bf88d44"]
    }
    ```
*   **Response (201 Created - Success)**:
    ```json
    {
      "status": "success",
      "message": "Invitation sent successfully. The developer will see it in their dashboard.",
      "data": {
        "invitation": {
          "_id": "64c910b471c9ba3ef123ad99",
          "sender": "64b73c4f923b0923ec18a75e",
          "recipientEmail": "developer@example.com",
          "sharedProjects": ["64b63e8a4a39031c9bf88d44"],
          "status": "pending",
          "createdAt": "2026-07-16T10:20:00.000Z"
        }
      }
    }
    ```
*   **Response (400 Bad Request - Email Missing/Invalid)**:
    ```json
    {
      "status": "fail",
      "message": "A valid developer email is required."
    }
    ```
*   **Response (400 Bad Request - Self Invite)**:
    ```json
    {
      "status": "fail",
      "message": "You cannot send an invitation to yourself"
    }
    ```
*   **Response (400 Bad Request - Already in Team)**:
    ```json
    {
      "status": "fail",
      "message": "This developer is already in your team"
    }
    ```
*   **Response (400 Bad Request - Invite Pending)**:
    ```json
    {
      "status": "fail",
      "message": "An invitation is already pending for this developer"
    }
    ```
*   **Response (403 Forbidden - IDOR Project Access Violation)**:
    ```json
    {
      "status": "fail",
      "message": "One or more selected projects do not belong to you or are archived."
    }
    ```
*   **Response (404 Not Found - User Email Not Found)**:
    ```json
    {
      "status": "fail",
      "message": "Cannot find user with this email"
    }
    ```
*   **Response (422 Unprocessable Entity - Plan Limit Exceeded)**:
    ```json
    {
      "status": "fail",
      "message": "The invitee has reached the FREE plan limit (3 projects). They currently control 2 project(s). Ask them to upgrade to PRO or share fewer projects."
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Invalid token or user session expired."
    }
    ```

#### GET `/invitations/my-projects`
Lists non-archived projects owned by the calling admin.
*   **Response (200 OK - Success)**:
    ```json
    {
      "status": "success",
      "results": 1,
      "data": {
        "projects": [
          {
            "_id": "64b63e8a4a39031c9bf88d44",
            "name": "DevTracker Dashboard",
            "status": "active"
          }
        ]
      }
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

#### GET `/invitations/getallinetations`
Lists pending invitations received by the current developer.
*   **Response (200 OK - Success)**:
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
              "email": "jane@example.com"
            },
            "recipientEmail": "developer@example.com",
            "sharedProjects": [
              {
                "_id": "64b63e8a4a39031c9bf88d44",
                "name": "DevTracker Dashboard"
              }
            ],
            "status": "pending"
          }
        ]
      }
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```
*   **Response (404 Not Found - User Record Missing)**:
    ```json
    {
      "status": "fail",
      "message": "user not found"
    }
    ```

#### POST `/invitations/respond/:invitationId`
Accepts or declines a pending invitation.
*   **Request Body**:
    ```json
    {
      "decision": "accept"
    }
    ```
*   **Response (200 OK - Accepted Success)**:
    ```json
    {
      "status": "success",
      "message": "Invitation accepted. You are now part of the team!"
    }
    ```
*   **Response (200 OK - Rejected Success)**:
    ```json
    {
      "status": "success",
      "message": "Invitation rejected."
    }
    ```
*   **Response (400 Bad Request - Missing Input)**:
    ```json
    {
      "status": "fail",
      "message": "Decision and Invitation ID are required"
    }
    ```
*   **Response (400 Bad Request - Already Processed)**:
    ```json
    {
      "status": "fail",
      "message": "This invitation is no longer valid or has already been processed."
    }
    ```
*   **Response (400 Bad Request - Invalid Decision Keyword)**:
    ```json
    {
      "status": "fail",
      "message": "Invalid decision. Must be 'accept' or 'reject'."
    }
    ```
*   **Response (403 Forbidden - Not the Intended Recipient)**:
    ```json
    {
      "status": "fail",
      "message": "You are not authorized to respond to this invitation."
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

#### GET `/invitations/members`
Fetches team members under the admin.
*   **Response (200 OK - Success)**:
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
*   **Response (404 Not Found - Admin Account Missing)**:
    ```json
    {
      "status": "fail",
      "message": "Admin not found"
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

#### DELETE `/invitations/members/:memberId`
Removes a developer from the team.
*   **Response (200 OK - Success)**:
    ```json
    {
      "status": "success",
      "message": "Member removed successfully from your team"
    }
    ```
*   **Response (400 Bad Request - Missing IDs)**:
    ```json
    {
      "status": "fail",
      "message": "Admin ID and Member ID are required"
    }
    ```
*   **Response (400 Bad Request - User Not in Team)**:
    ```json
    {
      "status": "fail",
      "message": "This developer is not a member of your team"
    }
    ```
*   **Response (403 Forbidden - Not the Team Owner/Admin)**:
    ```json
    {
      "status": "fail",
      "message": "Access denied. You are not the owner of this team."
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

#### PATCH `/invitations/members/:memberId/permissions`
Updates a specific permission flag for a member.
*   **Request Body**:
    ```json
    {
      "key": "canManageTasks",
      "value": true
    }
    ```
*   **Response (200 OK - Success)**:
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
*   **Response (400 Bad Request - Invalid Payload Structure)**:
    ```json
    {
      "status": "fail",
      "message": "Member ID, permission key, and value are required"
    }
    ```
*   **Response (400 Bad Request - Invalid Permission Key)**:
    ```json
    {
      "status": "fail",
      "message": "Invalid permission key"
    }
    ```
*   **Response (403 Forbidden - Not the Team Owner/Admin)**:
    ```json
    {
      "status": "fail",
      "message": "Access denied. You are not the owner of this team."
    }
    ```
*   **Response (404 Not Found - Member Not in Team)**:
    ```json
    {
      "status": "fail",
      "message": "Member not found in your team or you are not the admin"
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

#### PATCH `/invitations/members/:memberId/assign-projects`
Assigns or replaces shared projects for a team member.
*   **Request Body**:
    ```json
    {
      "projectIds": ["64b63e8a4a39031c9bf88d44", "64b63f2b4a39031c9bf88d92"]
    }
    ```
*   **Response (200 OK - Success)**:
    ```json
    {
      "status": "success",
      "message": "Projects assigned successfully",
      "data": {
        "sharedProjects": [
          "64b63e8a4a39031c9bf88d44",
          "64b63f2b4a39031c9bf88d92"
        ]
      }
    }
    ```
*   **Response (400 Bad Request - Missing IDs)**:
    ```json
    {
      "status": "fail",
      "message": "Admin ID and Member ID are required"
    }
    ```
*   **Response (403 Forbidden - IDOR Project Access Violation)**:
    ```json
    {
      "status": "fail",
      "message": "One or more selected projects do not belong to you or are archived."
    }
    ```
*   **Response (403 Forbidden - Not the Team Owner/Admin)**:
    ```json
    {
      "status": "fail",
      "message": "Access denied. You are not the owner of this team."
    }
    ```
*   **Response (404 Not Found - Member Not Found)**:
    ```json
    {
      "status": "fail",
      "message": "Member not found"
    }
    ```
*   **Response (404 Not Found - Active Invitation Record Missing)**:
    ```json
    {
      "status": "fail",
      "message": "No active invitation or team membership found for this developer."
    }
    ```
*   **Response (422 Unprocessable Entity - Recipient Project Limit Exceeded)**:
    ```json
    {
      "status": "fail",
      "message": "The member has reached the FREE plan limit (3 projects). They currently control 2 project(s). Ask them to upgrade to PRO or share fewer projects."
    }
    ```
*   **Response (401 Unauthorized)**:
    ```json
    {
      "status": "fail",
      "message": "Authentication token required."
    }
    ```

---

## 5. Socket.io Real-Time Events

DevTracker sends WebSocket events to connected developers to keep the client interface synchronized.

| Event Name | Recipient | Payload Schema | Triggering Action |
| :--- | :--- | :--- | :--- |
| `new_invitation` | Invitee | `{ message, invitationId, senderName, sharedProjectCount, sentAt }` | Sent when an admin sends a new invitation. |
| `invitation_accepted` | Admin | `{ developerName, developerId, message }` | Sent when the invitee accepts the invitation. |
| `invitation_rejected` | Admin | `{ developerEmail, message }` | Sent when the invitee declines the invitation. |
| `removed_from_team` | Invitee | `{ message, adminId }` | Sent when the admin kicks a member from the team. |
| `permissions_updated` | Invitee | `{ adminId, updatedKey, newValue, message }` | Sent when the admin modifies a permission flag. |
| `project_limit_exceeded`| Invitee | `{ adminName, currentCount, limit, message }` | Fired if the shared project count exceeds the invitee's Free plan limit. |

---

## 6. Frontend Angular Integration

The Angular client utilizes a caching service to handle team updates.

### 6.1 Caching Layer (`TeamsService`)
Located at: `src/app/core/services/teams.service.ts`
*   **`BehaviorSubject` Source of Truth**: A private `_teams$` BehaviorSubject stores the current list of owned and joined teams.
*   **Observable Stream**: `teams$` exposes the cache as a read-only stream.
*   **Optimistic / Instant Cache Updates**:
    *   **On Remove Member**: Filters the targeted developer out of the cache immediately, updating subscribers without executing a secondary network query.
    *   **On Assign Projects**: Merges the backend's updated `sharedProjects` array into the cache immediately, ensuring the team list updates without a page reload.

```typescript
// Example: In-memory cache update when projects are assigned
this._teams$.next({
  ...current,
  data: {
    ownedTeams:  current.data.ownedTeams.map((t) => ({ ...t, members: patchMember(t.members) })),
    memberTeams: current.data.memberTeams.map((t) => ({ ...t, members: patchMember(t.members) })),
  },
});
```
