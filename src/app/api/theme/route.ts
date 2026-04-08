import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/store';

export async function GET() {
  return NextResponse.json({ theme: store.getTheme() });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { theme } = body;
  if (theme && theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'Theme must be "light" or "dark"' }, { status: 400 });
  }
  const result: { theme?: string } = {};
  if (theme) result.theme = store.setTheme(theme);
  return NextResponse.json(result);
}
