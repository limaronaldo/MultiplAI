/**
 * Swagger UI HTML Generator
 * Issue #342 - Serves interactive API documentation at /docs
 */

import { getOpenAPIJSON } from "./openapi";

/**
 * Generate Swagger UI HTML page
 * Uses CDN-hosted Swagger UI for zero dependencies
 */
export function generateSwaggerHTML(): string {
  const openApiSpec = getOpenAPIJSON();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoDev API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui.css">
  <style>
    html { box-sizing: border-box; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }

    /* Custom theme */
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 30px 0; }
    .swagger-ui .info .title { color: #1e3a5f; }
    .swagger-ui .info .description p { color: #333; }
    .swagger-ui .opblock-tag { font-size: 18px; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #61affe; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #49cc90; }
    .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #fca130; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #f93e3e; }

    /* Header */
    .custom-header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
      color: white;
      padding: 20px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .custom-header .links a {
      color: #93c5fd;
      text-decoration: none;
      margin-left: 20px;
      font-size: 14px;
    }
    .custom-header .links a:hover { text-decoration: underline; }

    /* Status badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.1);
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <div>
      <h1>AutoDev API</h1>
      <span class="status-badge">
        <span class="status-dot"></span>
        Operational
      </span>
    </div>
    <div class="links">
      <a href="/">Home</a>
      <a href="/api/health">Health</a>
      <a href="https://github.com/limaronaldo/MultiplAI" target="_blank">GitHub</a>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      const spec = ${openApiSpec};

      window.ui = SwaggerUIBundle({
        spec: spec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        docExpansion: "list",
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        requestInterceptor: (request) => {
          // Add any default headers here
          return request;
        }
      });
    };
  </script>
</body>
</html>`;
}

/**
 * Generate ReDoc HTML page (alternative documentation)
 */
export function generateReDocHTML(): string {
  const openApiSpec = getOpenAPIJSON();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoDev API Documentation</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="redoc-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/redoc@2.1.3/bundles/redoc.standalone.js"></script>
  <script>
    const spec = ${openApiSpec};
    Redoc.init(spec, {
      theme: {
        colors: {
          primary: { main: '#1e3a5f' }
        },
        typography: {
          fontFamily: 'Inter, system-ui, sans-serif',
          headings: { fontFamily: 'Inter, system-ui, sans-serif' }
        },
        sidebar: {
          backgroundColor: '#fafafa'
        }
      },
      hideDownloadButton: false,
      expandResponses: '200',
      pathInMiddlePanel: true,
      scrollYOffset: 0
    }, document.getElementById('redoc-container'));
  </script>
</body>
</html>`;
}
