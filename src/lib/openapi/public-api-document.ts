const errorResponse = {
  description: "Request rejected",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};
const rateLimitedResponse = {
  ...errorResponse,
  description: "Credential rate limit exceeded",
  headers: {
    "Retry-After": {
      schema: { type: "integer", example: 60 },
      description: "Seconds before retrying",
    },
  },
};
const publicRateLimitedResponse = {
  ...errorResponse,
  description: "Webform rate limit exceeded",
};
const bearerSecurity = [{ integrationBearer: [] }];

export const publicApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CRM Integration API",
    version: "1.0.0",
    description:
      "Server-to-server CRM API. Create a workspace API key in Account & API settings, then send it as an HTTP Bearer credential.",
  },
  servers: [{ url: "/", description: "Current CRM origin" }],
  tags: [
    { name: "Integrations", description: "Workspace API key required" },
    {
      name: "Public",
      description: "Public or separately signed intake endpoints",
    },
  ],
  paths: {
    "/api/integrations/v1/contacts": {
      get: {
        tags: ["Integrations"],
        summary: "List contacts",
        operationId: "listContacts",
        security: bearerSecurity,
        "x-required-grant": "contacts.read",
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: {
          "200": {
            description: "Contact rows",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rows"],
                  properties: {
                    rows: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Contact" },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "429": rateLimitedResponse,
        },
      },
    },
    "/api/integrations/v1/leads": {
      get: {
        tags: ["Integrations"],
        summary: "List leads",
        operationId: "listLeads",
        security: bearerSecurity,
        "x-required-grant": "leads.read",
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: {
          "200": {
            description: "Lead rows",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rows"],
                  properties: {
                    rows: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Lead" },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "429": rateLimitedResponse,
        },
      },
      post: {
        tags: ["Integrations"],
        summary: "Create a lead",
        operationId: "createLead",
        security: bearerSecurity,
        "x-required-grant": "leads.create",
        description:
          "`operationKey` makes retries idempotent. Reusing it with different input returns 409.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateLead" },
            },
          },
        },
        responses: {
          "200": { $ref: "#/components/responses/CommandResult" },
          "400": errorResponse,
          "401": errorResponse,
          "409": errorResponse,
          "413": errorResponse,
          "429": rateLimitedResponse,
        },
      },
    },
    "/api/integrations/v1/tickets": {
      post: {
        tags: ["Integrations"],
        summary: "Create a ticket",
        operationId: "createTicket",
        security: bearerSecurity,
        "x-required-grant": "tickets.create",
        description:
          "`operationKey` makes retries idempotent. Reusing it with different input returns 409.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTicket" },
            },
          },
        },
        responses: {
          "200": { $ref: "#/components/responses/CommandResult" },
          "400": errorResponse,
          "401": errorResponse,
          "409": errorResponse,
          "413": errorResponse,
          "429": rateLimitedResponse,
        },
      },
    },
    "/api/integrations/v1/events": {
      post: {
        tags: ["Integrations"],
        summary: "Submit an integration event",
        operationId: "submitEvent",
        security: bearerSecurity,
        "x-required-grant": "events.write",
        description:
          "`externalId` is the idempotency key. Maximum body size is 256 KiB.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InboundEvent" },
            },
          },
        },
        responses: {
          "200": {
            description: "Accepted or replayed event",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventResult" },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "409": errorResponse,
          "413": errorResponse,
          "429": rateLimitedResponse,
        },
      },
    },
    "/api/public/webforms/{slug}": {
      post: {
        tags: ["Public"],
        summary: "Submit a configured webform",
        operationId: "submitWebform",
        description:
          "Public forms require no credential. A `signed_system` form additionally requires its separate Bearer token, millisecond timestamp, and SHA-256 signature of `<token>.<timestamp>.<raw-body>`. Maximum body size is 64 KiB.",
        security: [{}, { webformBearer: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", maxLength: 255 },
          },
          {
            name: "X-Webform-Timestamp",
            in: "header",
            required: false,
            schema: { type: "integer", format: "int64" },
            description:
              "Required for signed_system forms; accepted within five minutes",
          },
          {
            name: "X-Webform-Signature",
            in: "header",
            required: false,
            schema: { type: "string", pattern: "^[0-9a-f]{64}$" },
            description: "Required for signed_system forms",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WebformSubmission" },
            },
          },
        },
        responses: {
          "200": {
            description: "Created or replayed CRM record",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebformResult" },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
          "413": errorResponse,
          "429": publicRateLimitedResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      integrationBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "32 lowercase hexadecimal characters",
        description:
          "Workspace API key from Account & API settings. Legacy crm_ credentials remain accepted but are not newly issued.",
      },
      webformBearer: {
        type: "http",
        scheme: "bearer",
        description:
          "Separate token created with a signed_system webform; not a workspace integration key.",
      },
    },
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 100 },
      },
    },
    responses: {
      CommandResult: {
        description: "Created or idempotently replayed record",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CommandResult" },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        examples: [
          {
            error: {
              code: "authentication_required",
              requestId: "8a0e7a16-5e26-4c26-a412-c7cebe349442",
            },
          },
        ],
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "requestId"],
            properties: {
              code: { type: "string" },
              requestId: { type: "string" },
            },
          },
        },
      },
      Contact: {
        type: "object",
        required: ["id", "firstName", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          firstName: { type: "string" },
          lastName: { type: ["string", "null"] },
          email: { type: ["string", "null"], format: "email" },
          phone: { type: ["string", "null"] },
          companyId: { type: ["string", "null"] },
          updatedAt: { type: "integer", format: "int64" },
        },
      },
      Lead: {
        type: "object",
        required: ["id", "firstName", "sourceId", "statusId", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          firstName: { type: "string" },
          lastName: { type: ["string", "null"] },
          email: { type: ["string", "null"], format: "email" },
          phone: { type: ["string", "null"] },
          sourceId: { type: "string" },
          statusId: { type: "string" },
          ownerMembershipId: { type: ["string", "null"] },
          updatedAt: { type: "integer", format: "int64" },
        },
      },
      CreateLead: {
        type: "object",
        additionalProperties: false,
        examples: [
          {
            operationKey: "partner-lead-1001",
            firstName: "An",
            email: "an@example.com",
            sourceId: "partner-api",
          },
        ],
        required: ["operationKey", "firstName"],
        properties: {
          operationKey: { type: "string", minLength: 1, maxLength: 255 },
          firstName: { type: "string", minLength: 1, maxLength: 200 },
          lastName: { type: ["string", "null"], maxLength: 200 },
          email: { type: ["string", "null"], format: "email", maxLength: 320 },
          phone: { type: ["string", "null"], maxLength: 80 },
          sourceId: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            default: "manual",
          },
        },
      },
      CreateTicket: {
        type: "object",
        additionalProperties: false,
        examples: [
          {
            operationKey: "partner-ticket-1001",
            subject: "Cần hỗ trợ đơn hàng",
            description: "Khách hàng cần kiểm tra trạng thái giao hàng.",
            source: "partner-api",
          },
        ],
        required: ["operationKey", "subject"],
        properties: {
          operationKey: { type: "string", minLength: 1, maxLength: 255 },
          subject: { type: "string", minLength: 1, maxLength: 300 },
          description: { type: ["string", "null"], maxLength: 10000 },
          source: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            default: "api",
          },
        },
      },
      InboundEvent: {
        type: "object",
        additionalProperties: false,
        examples: [
          {
            externalId: "partner-event-1001",
            subjectId: "customer-1001",
            type: "customer.updated",
            occurredAt: "2026-09-07T07:00:00.000Z",
            payload: { tier: "gold" },
          },
        ],
        required: ["externalId", "subjectId", "type", "occurredAt", "payload"],
        properties: {
          externalId: { type: "string", minLength: 1, maxLength: 255 },
          subjectId: { type: "string", minLength: 1, maxLength: 255 },
          type: {
            type: "string",
            pattern: "^[a-z][a-z0-9_.-]*$",
            maxLength: 120,
          },
          occurredAt: { type: "string", format: "date-time" },
          payload: { type: "object", additionalProperties: true },
        },
      },
      CommandResult: {
        type: "object",
        examples: [
          { id: "3bdd77e3-9838-497a-b9e3-54dd6bfb2cdb", replayed: false },
        ],
        required: ["id", "replayed"],
        properties: {
          id: { type: "string", format: "uuid" },
          replayed: { type: "boolean" },
        },
      },
      EventResult: {
        type: "object",
        examples: [
          {
            id: "d34747db-c692-460b-88da-e773bd77486e",
            state: "received",
            replayed: false,
          },
        ],
        required: ["id", "state", "replayed"],
        properties: {
          id: { type: "string", format: "uuid" },
          state: { type: "string", enum: ["received", "superseded"] },
          replayed: { type: "boolean" },
        },
      },
      WebformSubmission: {
        type: "object",
        examples: [{ firstName: "An", email: "an@example.com", consent: true }],
        maxProperties: 50,
        propertyNames: { type: "string", minLength: 1, maxLength: 80 },
        additionalProperties: {
          anyOf: [
            { type: "string", maxLength: 10000 },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      },
      WebformResult: {
        type: "object",
        examples: [
          {
            recordId: "774fb77a-ab71-4719-af7d-0fb41ce0d055",
            replayed: false,
            missingFields: [],
            entity: "lead",
            source: "website",
          },
        ],
        required: ["recordId", "replayed", "missingFields", "entity", "source"],
        properties: {
          recordId: { type: "string", format: "uuid" },
          replayed: { type: "boolean" },
          missingFields: { type: "array", items: { type: "string" } },
          entity: { type: "string", enum: ["lead", "ticket"] },
          source: { type: "string" },
        },
      },
    },
  },
} as const;
