# Sentry MCP Client

A minimalistic client for the Sentry MCP server using Hono and the MCP TypeScript SDK.

## Overview

This client connects to the Sentry MCP server at `https://mcp.sentry.dev/sse` using the Model Context Protocol (MCP). It implements OAuth 2.0 authentication with PKCE (Proof Key for Code Exchange) to securely authenticate with the server.

The client provides a simple web interface that allows users to:
1. Connect to the Sentry MCP server
2. Authenticate using OAuth
3. View available Sentry tools

## How It Works

### OAuth Authentication Flow

The client implements a complete OAuth 2.0 flow with PKCE:

1. **Client Registration**: When a user clicks "Connect to Sentry MCP", the client registers with the Sentry OAuth server.
2. **Authorization Request**: The client generates a code verifier and redirects the user to the Sentry authorization page.
3. **User Authentication**: The user authenticates with Sentry and grants permissions.
4. **Authorization Code**: Sentry redirects back to our callback URL with an authorization code.
5. **Token Exchange**: The client exchanges the authorization code for access and refresh tokens.
6. **API Access**: The client uses the access token to connect to the Sentry MCP server.

### Key Components

#### SimpleOAuthProvider

The `SimpleOAuthProvider` class implements the `OAuthClientProvider` interface from the MCP SDK. It handles:

- Client registration with the OAuth server
- Storing client information and tokens in memory
- Managing the PKCE code verifier
- Handling redirects for the authorization flow

Key methods:
- `redirectToAuthorization`: Throws an error with the authorization URL for the application to handle
- `saveCodeVerifier`: Stores the PKCE code verifier
- `codeVerifier`: Retrieves the stored code verifier for token exchange

#### Hono Application

The Hono application provides the web interface and API endpoints:

- `GET /`: Serves the main UI with the connect button
- `GET /oauth/callback`: Handles the OAuth callback and completes the authentication
- `POST /api/connect`: Initiates the connection to the Sentry MCP server

#### SSE Client Transport

The `SSEClientTransport` from the MCP SDK handles the communication with the Sentry MCP server using Server-Sent Events (SSE). It's configured with our OAuth provider to handle authentication.

### Fetch Patching

The client includes a patch for the `fetch` function to handle issues with the `cache` field:

```javascript
const originalFetch = globalThis.fetch;
globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init && init.cache) {
    const { cache, ...rest } = init;
    return originalFetch(input, rest);
  }
  return originalFetch(input, init);
};
```

## Running the Client

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Open your browser to http://localhost:8978

4. Click the "Connect to Sentry MCP" button to start the OAuth flow

## Available Sentry Tools

Once connected, the client can access various Sentry tools:

- **list_organizations**: List all organizations the user has access to
- **list_teams**: List all teams in an organization
- **list_projects**: Retrieve a list of projects
- **list_issues**: List all issues in Sentry
- **list_releases**: List all releases in Sentry
- **list_tags**: List all tags in Sentry
- **get_issue_summary**: Retrieve a summary of an issue
- **get_issue_details**: Retrieve detailed information about specific issues
- **search_errors**: Query Sentry for errors using advanced search syntax
- **search_transactions**: Query Sentry for transactions
- **create_team**: Create a new team in Sentry
- **create_project**: Create a new project in Sentry
- **create_dsn**: Create a new Sentry DSN for a specific project
- **list_dsns**: List all Sentry DSNs for a specific project
- **begin_autofix**: Analyze an issue and suggest a fix
- **get_autofix_status**: Get the status of a root cause analysis

## Implementation Details

### In-Memory Storage

This implementation uses in-memory storage for OAuth tokens and client information. In a production environment, you would want to use a more persistent storage solution like KV storage.

### Error Handling

The client includes error handling for:
- Connection failures
- Authentication errors
- API errors

### Redirect Handling

The client handles redirects for the OAuth flow by:
1. Throwing an error with the redirect URL in the `redirectToAuthorization` method
2. Catching this error in the `/api/connect` endpoint
3. Returning the redirect URL to the client-side JavaScript
4. Using `window.location.href` to perform the redirect in the browser

## Deployment

To deploy the client to Cloudflare Workers:

```
npm run deploy
```

This will deploy the client using Wrangler.
