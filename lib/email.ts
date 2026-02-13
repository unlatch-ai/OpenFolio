export type InviteEmailPayload = {
  to: string;
  workspaceName: string;
  inviterName?: string | null;
  role: "owner" | "member";
  inviteLink: string;
};

export async function sendWorkspaceInviteEmail(payload: InviteEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM");
  }

  const subject = `You\u2019re invited to join ${payload.workspaceName} on OpenFolio`;
  const inviterLine = payload.inviterName ? `${payload.inviterName} invited you` : "You\u2019ve been invited";

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">${inviterLine}</h2>
      <p style="margin: 0 0 12px;">
        You\u2019ve been invited to join <strong>${payload.workspaceName}</strong> as a ${payload.role}.
      </p>
      <p style="margin: 0 0 16px;">
        <a href="${payload.inviteLink}" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none;">
          Accept invite
        </a>
      </p>
      <p style="margin: 0; color: #475569; font-size: 14px;">
        If the button doesn\u2019t work, paste this link into your browser:<br/>
        ${payload.inviteLink}
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${response.status} ${text}`);
  }
}

export type AppInviteEmailPayload = {
  to: string;
  inviteLink: string;
  inviterName?: string | null;
};

export async function sendAppInviteEmail(payload: AppInviteEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM");
  }

  const subject = "You're invited to OpenFolio";
  const inviterLine = payload.inviterName ? `${payload.inviterName} invited you` : "You've been invited";

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">${inviterLine}</h2>
      <p style="margin: 0 0 12px;">
        OpenFolio is currently invite-only. Use your invite link to create an account.
      </p>
      <p style="margin: 0 0 16px;">
        <a href="${payload.inviteLink}" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none;">
          Create account
        </a>
      </p>
      <p style="margin: 0; color: #475569; font-size: 14px;">
        If the button doesn't work, paste this link into your browser:<br/>
        ${payload.inviteLink}
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${response.status} ${text}`);
  }
}
