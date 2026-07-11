type FolderShareRole = "viewer" | "editor";
type FolderShareScope = "folder_only" | "folder_and_subfolders";
type ShareResult = "invite" | "share";

type ShareRpcRow = {
  invite_id: string | null;
  matched_user_id: string | null;
  share_id: string | null;
};

type FolderRow = {
  id: string;
  name: string;
  owner_id: string;
};

type InviteRow = {
  email: string;
  id: string;
  token: string;
};

type ProfileRow = {
  display_name: string | null;
  email: string | null;
};

type RequestBody = {
  email?: string;
  folderId?: string;
  role?: FolderShareRole;
  scope?: FolderShareScope;
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const env = (key: string): string => Deno.env.get(key) ?? "";

const supabaseUrl = env("SUPABASE_URL");
const supabaseAnonKey = env("SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
const resendApiKey = env("RESEND_API_KEY");
const resendFromEmail = env("RESEND_FROM_EMAIL");
const publicBaseUrl = env("APP_PUBLIC_BASE_URL").replace(/\/$/, "");

const appLink = (path: string): string =>
  publicBaseUrl ? `${publicBaseUrl}${path}` : `trove://${path.replace(/^\//, "")}`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json();
    const message = payload?.message ?? payload?.error ?? payload?.msg;
    return typeof message === "string" && message.trim() ? message : fallback;
  } catch {
    return fallback;
  }
};

const supabaseFetch = async <T>(
  path: string,
  options: RequestInit & { serviceRole?: boolean; userToken?: string } = {},
): Promise<T> => {
  const apiKey = options.serviceRole ? supabaseServiceRoleKey : supabaseAnonKey;
  const authorization = options.serviceRole
    ? `Bearer ${supabaseServiceRoleKey}`
    : options.userToken
      ? `Bearer ${options.userToken}`
      : "";

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Supabase request failed."));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const getAuthUserEmail = async (userToken: string): Promise<string | null> => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Sign in to send folder invites.");
  }

  const user = await response.json();
  return typeof user?.email === "string" ? user.email : null;
};

const getOwnerLabel = async (ownerId: string, fallbackEmail: string | null): Promise<string> => {
  const profiles = await supabaseFetch<ProfileRow[]>(
    `/rest/v1/profiles?select=display_name,email&id=eq.${encodeURIComponent(ownerId)}&limit=1`,
    { method: "GET", serviceRole: true },
  );
  const profile = profiles[0];
  return profile?.display_name || profile?.email || fallbackEmail || "Someone";
};

const updateInviteEmailStatus = async (
  inviteId: string | null,
  input: { deliveryId?: string | null; error?: string | null; sent: boolean },
): Promise<void> => {
  if (!inviteId) return;

  await supabaseFetch(
    `/rest/v1/trove_folder_share_invites?id=eq.${encodeURIComponent(inviteId)}`,
    {
      body: JSON.stringify({
        email_delivery_id: input.deliveryId ?? null,
        email_last_error: input.error ?? null,
        email_sent_at: input.sent ? new Date().toISOString() : null,
      }),
      method: "PATCH",
      serviceRole: true,
    },
  );
};

const sendEmail = async (input: {
  acceptUrl: string;
  email: string;
  folderName: string;
  ownerLabel: string;
  result: ShareResult;
  role: FolderShareRole;
  scope: FolderShareScope;
}): Promise<{ deliveryId?: string; error?: string; sent: boolean }> => {
  if (!resendApiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured." };
  }

  if (!resendFromEmail) {
    return { sent: false, error: "RESEND_FROM_EMAIL is not configured." };
  }

  const escapedFolderName = escapeHtml(input.folderName);
  const escapedOwnerLabel = escapeHtml(input.ownerLabel);
  const escapedRole = input.role === "editor" ? "edit" : "view";
  const escapedScope =
    input.scope === "folder_and_subfolders" ? "this folder and its subfolders" : "this folder";
  const actionLabel = input.result === "share" ? "Open Folder" : "Accept Invite";

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: resendFromEmail,
      to: input.email,
      subject: `${input.ownerLabel} shared "${input.folderName}" with you`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #191919;">
          <h1 style="font-size: 22px; margin-bottom: 12px;">${escapedOwnerLabel} shared a folder with you</h1>
          <p>You have been invited to ${escapedRole} <strong>${escapedFolderName}</strong> in Trove.</p>
          <p>This invite includes ${escapedScope}.</p>
          <p style="margin: 28px 0;">
            <a href="${input.acceptUrl}" style="background: #111111; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block;">
              ${actionLabel}
            </a>
          </p>
          <p style="color: #666666; font-size: 13px;">If the button does not work, copy and paste this link:</p>
          <p style="word-break: break-all; color: #666666; font-size: 13px;">${escapeHtml(input.acceptUrl)}</p>
        </div>
      `,
      text: `${input.ownerLabel} shared "${input.folderName}" with you in Trove.\n\n${actionLabel}: ${input.acceptUrl}`,
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return {
      sent: false,
      error: await parseErrorMessage(response, "Resend could not send the invite email."),
    };
  }

  const data = await response.json();
  return {
    sent: true,
    deliveryId: typeof data?.id === "string" ? data.id : undefined,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Supabase function environment is not configured." }, 500);
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const userToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!userToken) {
      return jsonResponse({ error: "Sign in to send folder invites." }, 401);
    }

    const userEmail = await getAuthUserEmail(userToken);
    const body = (await request.json()) as RequestBody;
    const email = body.email?.trim().toLowerCase();
    const folderId = body.folderId?.trim();
    const role = body.role ?? "viewer";
    const scope = body.scope ?? "folder_only";

    if (!email || !folderId) {
      return jsonResponse({ error: "Email and folder are required." }, 400);
    }

    const shareRows = await supabaseFetch<ShareRpcRow[]>("/rest/v1/rpc/trove_share_folder", {
      body: JSON.stringify({
        target_email: email,
        target_folder_id: folderId,
        share_role: role,
        share_scope: scope,
      }),
      method: "POST",
      userToken,
    });

    const shareRow = Array.isArray(shareRows) ? shareRows[0] : shareRows;
    const result: ShareResult = shareRow?.share_id ? "share" : "invite";

    const folders = await supabaseFetch<FolderRow[]>(
      `/rest/v1/trove_folders?select=id,name,owner_id&id=eq.${encodeURIComponent(folderId)}&limit=1`,
      { method: "GET", serviceRole: true },
    );
    const folder = folders[0];
    if (!folder) {
      return jsonResponse({ error: "Folder not found after sharing." }, 404);
    }

    let acceptUrl = appLink(`/folder/${encodeURIComponent(folder.id)}`);
    let inviteId: string | null = shareRow?.invite_id ?? null;

    if (result === "invite" && inviteId) {
      const invites = await supabaseFetch<InviteRow[]>(
        `/rest/v1/trove_folder_share_invites?select=id,email,token&id=eq.${encodeURIComponent(inviteId)}&limit=1`,
        { method: "GET", serviceRole: true },
      );
      const invite = invites[0];
      if (!invite) {
        return jsonResponse({ error: "Invite not found after sharing." }, 404);
      }
      acceptUrl = appLink(`/share-invite/${encodeURIComponent(invite.token)}`);
    }

    const ownerLabel = await getOwnerLabel(folder.owner_id, userEmail);
    const emailResult = await sendEmail({
      acceptUrl,
      email,
      folderName: folder.name,
      ownerLabel,
      result,
      role,
      scope,
    });

    await updateInviteEmailStatus(inviteId, {
      deliveryId: emailResult.deliveryId ?? null,
      error: emailResult.error ?? null,
      sent: emailResult.sent,
    });

    return jsonResponse({
      emailError: emailResult.error,
      emailSent: emailResult.sent,
      inviteId,
      result,
      shareId: shareRow?.share_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send folder invite.";
    return jsonResponse({ error: message }, 400);
  }
});
