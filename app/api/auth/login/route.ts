/**
 * 画面名: ログインAPI
 * ファイルパス: app/api/auth/login/route.ts
 * 役割: 社員コード・パスワード検証、JWT発行およびセッションCookie（sfa_session）の設定
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const COOKIE_NAME = 'sfa_session';
const EMPLOYEE_CODE_REGEX = /^\d{6}$/;
const PASSWORD_MAX_LENGTH = 64;

let cachedSupabaseAdmin: SupabaseClient | null = null;

/**
 * Supabase管理用クライアントを遅延初期化する関数。
 */
function getSupabaseAdmin(): SupabaseClient {
    if (cachedSupabaseAdmin) {
        return cachedSupabaseAdmin;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase environment variables are not set.');
    }

    cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    return cachedSupabaseAdmin;
}

/**
 * JWT署名用のシークレットキーを生成する関数。
 */
function getSecretKey(): Uint8Array {
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
        throw new Error('AUTH_SECRET is not set.');
    }
    return new TextEncoder().encode(authSecret);
}

/**
 * 入力値（unknown）が文字列であれば前後空白を除去し、それ以外は空文字を返す正規化関数。
 */
function normalizeCode(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * ログインリクエスト（社員コード・パスワード）を検証し、認証成功時にJWTを発行してセッションCookieへ設定するPOSTハンドラ。
 */
export async function POST(req: NextRequest) {
    try {
        const secretKey = getSecretKey();
        const supabaseAdmin = getSupabaseAdmin();

        const body = (await req.json()) as Record<string, unknown>;
        const employeeCode = normalizeCode(body.employeeCode ?? body.employee_code);
        const password = typeof body.password === 'string' ? body.password : '';

        if (!EMPLOYEE_CODE_REGEX.test(employeeCode)) {
            return NextResponse.json(
                { error: '社員コードは半角数字6桁で入力してください。' },
                { status: 400 }
            );
        }

        if (!password.trim() || password.length > PASSWORD_MAX_LENGTH) {
            return NextResponse.json(
                { error: 'パスワードを入力してください。' },
                { status: 400 }
            );
        }

        const { data: employee, error: dbError } = await supabaseAdmin
            .from('employees')
            .select('employee_code, employee_name, position_code, password_hash, is_admin, delete_flg')
            .eq('employee_code', employeeCode)
            .maybeSingle();

        if (dbError) {
            console.error('POST /api/auth/login Supabase error:', dbError);
            return NextResponse.json(
                { error: '認証処理中にエラーが発生しました。' },
                { status: 500 }
            );
        }

        if (!employee || employee.delete_flg || typeof employee.password_hash !== 'string') {
            return NextResponse.json(
                { error: '社員コードまたはパスワードが正しくありません。' },
                { status: 401 }
            );
        }

        const isValidPassword = await bcrypt.compare(password, employee.password_hash);
        if (!isValidPassword) {
            return NextResponse.json(
                { error: '社員コードまたはパスワードが正しくありません。' },
                { status: 401 }
            );
        }

        const normalizedEmployeeCode = normalizeCode(employee.employee_code);
        const normalizedPositionCode = normalizeCode(employee.position_code);

        const payload = {
            employeeCode: normalizedEmployeeCode,
            employeeName: String(employee.employee_name ?? '').trim(),
            positionCode: normalizedPositionCode || null,
            isAdmin: Boolean(employee.is_admin),
        };

        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secretKey);

        const forwardedProto = req.headers.get('x-forwarded-proto');
        const isHttps =
            forwardedProto === 'https' || req.nextUrl.protocol === 'https:';

        const response = NextResponse.json({ success: true, user: payload }, { status: 200 });
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: isHttps,
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        });

        return response;
    } catch (err) {
        console.error('POST /api/auth/login unexpected error:', err);
        return NextResponse.json(
            { error: 'ログイン処理中にエラーが発生しました。' },
            { status: 500 }
        );
    }
}