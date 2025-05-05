import { Hono } from 'hono';
import { html } from 'hono/html';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Patch fetch to handle the cache field issue
const originalFetch = globalThis.fetch;
globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
  // Create a new init object without the cache field
  if (init && init.cache) {
    const { cache, ...rest } = init;
    return originalFetch(input, rest);
  }
  return originalFetch(input, init);
};

// Define environment interface
interface Env {
  
}

// Define the necessary OAuth types for our implementation
interface ClientInformation {
  client_id: string;
  redirect_uris: string[];
  [key: string]: unknown;
}

interface ClientInformationFull extends ClientInformation {
  client_secret: string;
}

interface Tokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

// Simple in-memory OAuth provider (for initial implementation)
class SimpleOAuthProvider implements OAuthClientProvider {
  private clientInfo?: ClientInformationFull;
  private oauthTokens?: Tokens;
  private verifier?: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get redirectUrl(): string {
    return `${this.baseUrl}/oauth/callback`;
  }

  get clientMetadata() {
    return {
      client_name: 'Sentry MCP Client',
      redirect_uris: [this.redirectUrl],
      client_uri: this.baseUrl,
    };
  }

  async clientInformation() {
    return this.clientInfo;
  }

  async saveClientInformation(clientInformation: any): Promise<void> {
    this.clientInfo = clientInformation as ClientInformationFull;
    console.log('Client information saved:', clientInformation);
  }

  async tokens() {
    return this.oauthTokens;
  }

  async saveTokens(tokens: any): Promise<void> {
    this.oauthTokens = tokens as Tokens;
    console.log('Tokens saved');
  }

  // This method is called by the MCP SDK when it needs to redirect the user to the authorization URL
  // Instead of directly redirecting, we throw an error with the URL so our application can handle the redirect
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    // Throw an error with the URL so it can be caught and handled by the application
    throw new Error(`Redirect to: ${authorizationUrl.toString()}`);
  }

  // This method is called by the MCP SDK to save the PKCE code verifier
  // The code verifier is a random string used in the OAuth flow to prevent CSRF attacks
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.verifier = codeVerifier;
    console.log('Code verifier saved');
  }

  // This method is called by the MCP SDK to retrieve the saved code verifier
  // It's used when exchanging the authorization code for tokens
  async codeVerifier(): Promise<string> {
    if (!this.verifier) {
      throw new Error('No code verifier found');
    }
    return this.verifier;
  }
}

const app = new Hono<{ Bindings: Env }>();

// Global variable to store the OAuth provider (for simplicity in this demo)
let oauthProvider: SimpleOAuthProvider;

// Create an MCP client
const createMcpClient = async (request: Request): Promise<Client> => {
  // Get the base URL from the request
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  
  // Create the OAuth provider if it doesn't exist
  if (!oauthProvider) {
    oauthProvider = new SimpleOAuthProvider(baseUrl);
  }

  const client = new Client(
    { name: 'sentry-mcp-client', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // Connect to the Sentry MCP server using SSE transport
  const transport = new SSEClientTransport(
    new URL('https://mcp.sentry.dev/sse'),
    { authProvider: oauthProvider }
  );

  try {
    await client.connect(transport);
    console.log('Connected to Sentry MCP server');
    return client;
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
    throw error;
  }
};

// Main page with UI
app.get('/', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sentry MCP Client</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 {
            color: #362d59;
          }
          .container {
            margin: 20px 0;
          }
          button {
            padding: 10px 15px;
            font-size: 16px;
            background-color: #362d59;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #584b8c;
          }
          .results {
            margin-top: 20px;
          }
          .result {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 4px;
          }
          .loading {
            display: none;
            margin: 20px 0;
          }
          .error {
            color: red;
            margin: 20px 0;
            display: none;
          }
        </style>
      </head>
      <body>
        <h1>Sentry MCP Client</h1>
        <p>A minimalistic client for the Sentry MCP server.</p>
        
        <div class="container">
          <button id="connect-button">Connect to Sentry MCP</button>
        </div>
        
        <div id="loading" class="loading">Connecting...</div>
        <div id="error" class="error"></div>
        <div id="results" class="results"></div>
        
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const connectButton = document.getElementById('connect-button');
            const resultsContainer = document.getElementById('results');
            const loadingIndicator = document.getElementById('loading');
            const errorContainer = document.getElementById('error');
            
            connectButton.addEventListener('click', connectToSentry);
            
            async function connectToSentry() {
              // Clear previous results and show loading
              resultsContainer.innerHTML = '';
              errorContainer.style.display = 'none';
              loadingIndicator.style.display = 'block';
              
              try {
                const response = await fetch('/api/connect', {
                  method: 'POST'
                });
                
                const data = await response.json();
                
                if (data.redirect) {
                  // Redirect to authorization URL
                  console.log('Redirecting to:', data.redirect);
                  resultsContainer.innerHTML = '<p>Redirecting to Sentry for authentication...</p>';
                  // Use a small delay to show the message before redirecting
                  setTimeout(() => {
                    window.location.href = data.redirect;
                  }, 500);
                  return;
                }
                
                if (!response.ok) {
                  throw new Error(data.error || 'Connection failed');
                }
                
                // Display success message
                resultsContainer.innerHTML = '<p>Successfully connected to Sentry MCP server!</p>';
                
                // List available tools
                if (data.tools && data.tools.length > 0) {
                  const toolsList = document.createElement('div');
                  toolsList.innerHTML = '<h3>Available Tools:</h3><ul>';
                  
                  data.tools.forEach(tool => {
                    toolsList.innerHTML += \`<li>\${tool.name}</li>\`;
                  });
                  
                  toolsList.innerHTML += '</ul>';
                  resultsContainer.appendChild(toolsList);
                }
              } catch (error) {
                console.error('Connection error:', error);
                errorContainer.textContent = error.message || 'An error occurred while connecting. Please try again.';
                errorContainer.style.display = 'block';
              } finally {
                loadingIndicator.style.display = 'none';
              }
            }
          });
        </script>
      </body>
    </html>
  `);
});

// OAuth callback route
app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  
  if (!code) {
    return c.html(html`
      <html>
        <body>
          <h1>Authentication Error</h1>
          <p>No authorization code provided.</p>
        </body>
      </html>
    `);
  }
  
  try {
    // Finish the OAuth flow
    if (!oauthProvider) {
      throw new Error('OAuth provider not initialized');
    }
    
    // Get the base URL from the request
    const url = new URL(c.req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    
    // Create a new OAuth provider if needed
    if (!oauthProvider) {
      oauthProvider = new SimpleOAuthProvider(baseUrl);
    }
    
    // Create a client to finish the auth flow
    const client = new Client(
      { name: 'sentry-mcp-client', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    
    const transport = new SSEClientTransport(
      new URL('https://mcp.sentry.dev/sse'),
      { authProvider: oauthProvider }
    );
    
    // Finish the auth flow
    await transport.finishAuth(code);
    
    // Try to connect
    await client.connect(transport);
    
    return c.html(html`
      <html>
        <body>
          <h1>Authentication Successful</h1>
          <p>You have successfully authenticated with the Sentry MCP server.</p>
          <p><a href="/">Return to the main page</a></p>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    return c.html(html`
      <html>
        <body>
          <h1>Authentication Error</h1>
          <p>Failed to complete authentication: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p><a href="/">Return to the main page</a></p>
        </body>
      </html>
    `);
  }
});

// API endpoint to connect to Sentry MCP
app.post('/api/connect', async (c) => {
  try {
    const client = await createMcpClient(c.req.raw);
    
    // Get available tools
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools);
    
    // Close the client connection
    await client.close();
    
    return c.json({ success: true, tools: tools.tools });
  } catch (error) {
    console.error('Connection error:', error);
    
    // Check if this is a redirect error from the OAuth flow
    if (error instanceof Error && error.message.startsWith('Redirect to:')) {
      const redirectUrl = error.message.substring('Redirect to:'.length).trim();
      return c.json({ redirect: redirectUrl });
    }
    
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

export default app;
