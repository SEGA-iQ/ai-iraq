import { NextResponse, type NextRequest } from "next/server";

// Optional password protection. Set APP_PASSWORD (and optionally APP_USER,
// default "admin") before exposing the app beyond your own machine.
// The Meta webhook stays open because it authenticates with its own signature.

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function decodeBasic(header: string): [string, string] | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const i = decoded.indexOf(":");
    return i === -1 ? null : [decoded.slice(0, i), decoded.slice(i + 1)];
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.APP_USER || "admin";

  const creds = decodeBasic(req.headers.get("authorization") ?? "");
  if (creds && safeEqual(creds[0], user) && safeEqual(creds[1], password)) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ai-iraq", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/webhooks/meta|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
