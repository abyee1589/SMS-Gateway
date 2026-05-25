export type RequestContext = {
  requestId: string;
  startedAt: number;
};

export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  tenantId: string;
  role?: string;
};

export type AppRequest = Request & {
  context: RequestContext;
  user?: AuthenticatedRequestUser;
};