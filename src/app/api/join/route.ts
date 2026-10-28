import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/join
 * Body: { code: string, name: string }
 *
 * Серверная проверка кода класса/админа.
 * Коды НЕ экспонируются в клиентский бандл — хранятся в env.
 * Простой in-memory rate limit: 10 попыток / IP / минута.
 */

const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return { ok: true };
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - rec.firstAt)) / 1000) };
  }
  rec.count += 1;
  return { ok: true };
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Слишком много попыток. Подожди немного." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter || 60) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const { code, name } = (body || {}) as { code?: unknown; name?: unknown };
  if (typeof code !== "string" || typeof name !== "string") {
    return NextResponse.json({ ok: false, error: "Некорректные данные" }, { status: 400 });
  }

  const trimmedCode = code.trim();
  const trimmedName = name.trim().slice(0, 32);

  if (!trimmedName) {
    return NextResponse.json({ ok: false, error: "Введи имя" }, { status: 400 });
  }

  const classCode = process.env.CLASS_CODE;
  const adminCode = process.env.ADMIN_CODE;

  if (!classCode || !adminCode) {
    return NextResponse.json({ ok: false, error: "Сервер не настроен" }, { status: 500 });
  }

  const isClass = safeEqual(trimmedCode, classCode);
  const isAdmin = safeEqual(trimmedCode, adminCode);

  if (!isClass && !isAdmin) {
    return NextResponse.json({ ok: false, error: "Неверный код класса" }, { status: 401 });
  }

  const payload = {
    name: trimmedName,
    role: isAdmin ? "admin" : "member",
    iat: Date.now(),
  };

  return NextResponse.json({
    ok: true,
    user: payload,
  });
}
