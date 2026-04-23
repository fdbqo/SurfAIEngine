import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  applyCorsHeaders,
  isBrowserOriginForbidden,
  isInternalApiSecretInvalid,
  shouldBlockPublicUi,
} from "@/lib/middleware/gateway"

function jsonResponse(request: NextRequest, status: number, body: unknown) {
  const res = NextResponse.json(body, { status })
  applyCorsHeaders(request, res.headers)
  return res
}

function handleApi(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname

  if (isBrowserOriginForbidden(request)) {
    return jsonResponse(request, 403, { error: "Origin not allowed" })
  }

  if (isInternalApiSecretInvalid(request, pathname)) {
    return jsonResponse(request, 401, { error: "Unauthorized" })
  }

  if (request.method === "OPTIONS") {
    const headers = new Headers()
    applyCorsHeaders(request, headers)
    return new NextResponse(null, { status: 204, headers })
  }

  const response = NextResponse.next()
  applyCorsHeaders(request, response.headers)
  return response
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith("/api")) {
    return handleApi(request)
  }

  if (shouldBlockPublicUi()) {
    return new NextResponse(null, { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Run on all routes except Next image optimizer (keeps middleware on /_next/static so UI stays blocked when locked)
    "/((?!_next/image|favicon.ico).*)",
  ],
}
