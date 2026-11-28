/**
 * 画面名: 社員マスタ管理API（管理者用）
 * ファイルパス: app/api/admin/employees/route.ts
 * 役割: 管理者認証・権限チェックのもとでの社員一覧取得、新規登録、情報更新および論理削除
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'sfa_session';

const EMPLOYEE_CODE_REGEX = /^\d{6}$/;
const EMPLOYEE_NAME_MAX = 128;
const POSITION_CODE_MAX = 2;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;
const PASSWORD_HALF_WIDTH_PRINTABLE_REGEX = /^[!-~]+$/;
const PASSWORD_HASH_MAX = 128;

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
 * JWT検証用のシークレットキーを生成する関数。
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
 * テキスト入力値（unknown）が文字列であれば前後空白を除去し、それ以外は空文字を返す正規化関数。
 */
function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * リクエストのセッションCookie（sfa_session）内のJWTを検証し、ログイン中ユーザーの社員コードと管理者フラグを返す非同期関数（未認証・不正時はnull）。
 */
async function getCurrentAdmin(req: NextRequest): Promise<{
    employeeCode: string;
    isAdmin: boolean;
} | null> {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    try {
        const secretKey = getSecretKey();
        const { payload } = await jwtVerify(token, secretKey);
        const employeeCode = normalizeCode(payload.employeeCode);
        const isAdmin = Boolean(payload.isAdmin);
        if (!employeeCode) return null;
        return { employeeCode, isAdmin };
    } catch {
        return null;
    }
}

/**
 * 新規社員登録リクエストのボディ（社員コード・社員名・役職コード・初期パスワード・管理者権限）を検証し、正規化済みデータまたはエラーメッセージを返す関数。
 */
function validateCreatePayload(body: Record<string, unknown>):
    | {
        ok: true;
        data: {
            employee_code: string;
            employee_name: string;
            position_code: string;
            password: string;
            is_admin: boolean;
        };
    }
    | { ok: false; error: string } {
    const employee_code = normalizeCode(body.employee_code);
    const employee_name = normalizeText(body.employee_name);
    const position_code = normalizeCode(body.position_code);
    const password = typeof body.password === 'string' ? body.password : '';
    const is_admin = body.is_admin;

    if (!EMPLOYEE_CODE_REGEX.test(employee_code)) {
        return { ok: false, error: '社員コードは半角数字6桁で入力してください。' };
    }
    if (!employee_name) {
        return { ok: false, error: '社員名を入力してください。' };
    }
    if (employee_name.length > EMPLOYEE_NAME_MAX) {
        return { ok: false, error: `社員名は${EMPLOYEE_NAME_MAX}文字以内で入力してください。` };
    }
    if (!position_code || position_code.length > POSITION_CODE_MAX) {
        return { ok: false, error: '役職コードの指定が不正です。' };
    }
    if (!password) {
        return { ok: false, error: '初期パスワードを入力してください。' };
    }
    if (/\s/.test(password)) {
        return { ok: false, error: '初期パスワードに空白は使用できません。' };
    }
    if (password.length < PASSWORD_MIN) {
        return { ok: false, error: `初期パスワードは${PASSWORD_MIN}文字以上で入力してください。` };
    }
    if (password.length > PASSWORD_MAX) {
        return { ok: false, error: `初期パスワードは${PASSWORD_MAX}文字以内で入力してください。` };
    }
    if (!PASSWORD_HALF_WIDTH_PRINTABLE_REGEX.test(password)) {
        return { ok: false, error: '初期パスワードは半角英数字・記号のみで入力してください。' };
    }
    if (typeof is_admin !== 'boolean') {
        return { ok: false, error: '管理者権限の指定が不正です。' };
    }

    return {
        ok: true,
        data: { employee_code, employee_name, position_code, password, is_admin },
    };
}

/**
 * 指定された役職コードがpositionsテーブルに存在するかをSupabaseで確認する非同期関数。
 */
async function existsPositionCode(positionCode: string): Promise<boolean> {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
        .from('positions')
        .select('position_code')
        .eq('position_code', positionCode)
        .maybeSingle();

    return !error && Boolean(data);
}

/**
 * 管理者認証・権限チェックのうえ、有効な社員一覧・削除済み社員コード一覧・役職マスタ一覧を取得して返すGETハンドラ。
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await getCurrentAdmin(req);
        if (!auth) {
            return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
        }
        if (!auth.isAdmin) {
            return NextResponse.json({ error: '管理者権限が必要です。' }, { status: 403 });
        }

        const supabaseAdmin = getSupabaseAdmin();

        const [
            { data: employeesData, error: empError },
            { data: positionsData, error: posError },
        ] = await Promise.all([
            supabaseAdmin
                .from('employees')
                .select('employee_code, employee_name, position_code, is_admin, delete_flg')
                .order('employee_code', { ascending: true }),
            supabaseAdmin
                .from('positions')
                .select('position_code, position_name, sort_no')
                .order('sort_no', { ascending: true }),
        ]);

        if (empError || posError) {
            console.error('GET /api/admin/employees error:', empError || posError);
            return NextResponse.json(
                { error: '社員一覧の取得に失敗しました。' },
                { status: 500 }
            );
        }

        const rows = Array.isArray(employeesData) ? employeesData : [];

        const employees = rows
            .filter((row) => !row.delete_flg)
            .map((row) => ({
                employee_code: normalizeCode(row.employee_code),
                employee_name: normalizeText(row.employee_name),
                position_code: normalizeCode(row.position_code),
                is_admin: Boolean(row.is_admin),
                delete_flg: Boolean(row.delete_flg),
            }));

        const deletedEmployeeCodes = rows
            .filter((row) => Boolean(row.delete_flg))
            .map((row) => normalizeCode(row.employee_code))
            .filter(Boolean);

        const positions = (Array.isArray(positionsData) ? positionsData : []).map((pos) => ({
            position_code: normalizeCode(pos.position_code),
            position_name: normalizeText(pos.position_name),
        }));

        return NextResponse.json({
            employees,
            deletedEmployeeCodes,
            positions,
        });
    } catch (err) {
        console.error('Unexpected GET /api/admin/employees error:', err);
        return NextResponse.json(
            { error: '社員一覧の取得中にサーバーエラーが発生しました。' },
            { status: 500 }
        );
    }
}

/**
 * 管理者認証・権限チェックと入力検証・役職存在確認を行ったうえで、パスワードをハッシュ化してemployeesテーブルへ新規登録するPOSTハンドラ。
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await getCurrentAdmin(req);
        if (!auth) {
            return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
        }
        if (!auth.isAdmin) {
            return NextResponse.json({ error: '管理者権限が必要です。' }, { status: 403 });
        }

        const body = (await req.json()) as Record<string, unknown>;
        const parsed = validateCreatePayload(body);
        if (!parsed.ok) {
            return NextResponse.json({ error: parsed.error }, { status: 400 });
        }

        const { employee_code, employee_name, position_code, password, is_admin } = parsed.data;

        const validPos = await existsPositionCode(position_code);
        if (!validPos) {
            return NextResponse.json({ error: '存在しない役職コードです。' }, { status: 400 });
        }

        const password_hash = await bcrypt.hash(password, 10);
        if (password_hash.length > PASSWORD_HASH_MAX) {
            return NextResponse.json(
                { error: 'パスワードハッシュの長さが上限を超えています。' },
                { status: 400 }
            );
        }

        const updatedByCode = EMPLOYEE_CODE_REGEX.test(auth.employeeCode)
            ? auth.employeeCode
            : null;

        const supabaseAdmin = getSupabaseAdmin();

        const { error: insertError } = await supabaseAdmin.from('employees').insert({
            employee_code,
            employee_name,
            position_code,
            password_hash,
            is_admin,
            updated_by_employee_code: updatedByCode,
            delete_flg: false,
        });

        if (insertError) {
            if (insertError.code === '23505') {
                return NextResponse.json({ error: '社員番号が重複しています。' }, { status: 409 });
            }
            return NextResponse.json({ error: insertError.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, employee_code }, { status: 201 });
    } catch (err) {
        console.error('POST /api/admin/employees error:', err);
        return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 });
    }
}

/**
 * 管理者認証・権限チェックのもとで対象社員の論理削除（delete_flg: true）または社員情報（社員名・役職コード・管理者権限）の更新を行うPATCHハンドラ。
 */
export async function PATCH(req: NextRequest) {
    try {
        const auth = await getCurrentAdmin(req);
        if (!auth) {
            return NextResponse.json({ error: '認証が必要です。' }, { status: 401 });
        }
        if (!auth.isAdmin) {
            return NextResponse.json({ error: '管理者権限が必要です。' }, { status: 403 });
        }

        const body = (await req.json()) as Record<string, unknown>;
        const employee_code = normalizeCode(body.employee_code);

        if (!EMPLOYEE_CODE_REGEX.test(employee_code)) {
            return NextResponse.json(
                { error: '更新対象の社員コードが不正です。' },
                { status: 400 }
            );
        }

        const updatedByCode = EMPLOYEE_CODE_REGEX.test(auth.employeeCode)
            ? auth.employeeCode
            : null;

        const supabaseAdmin = getSupabaseAdmin();

        // 論理削除
        if (body.delete_flg === true) {
            const { error: delError } = await supabaseAdmin
                .from('employees')
                .update({
                    delete_flg: true,
                    updated_by_employee_code: updatedByCode,
                    updated_at: new Date().toISOString(),
                })
                .eq('employee_code', employee_code);

            if (delError) {
                return NextResponse.json({ error: delError.message }, { status: 400 });
            }

            return NextResponse.json({ ok: true });
        }

        // 編集更新
        const employee_name = normalizeText(body.employee_name);
        const position_code = normalizeCode(body.position_code);
        const is_admin = body.is_admin;

        if (!employee_name) {
            return NextResponse.json({ error: '社員名を入力してください。' }, { status: 400 });
        }
        if (employee_name.length > EMPLOYEE_NAME_MAX) {
            return NextResponse.json(
                { error: `社員名は${EMPLOYEE_NAME_MAX}文字以内で入力してください。` },
                { status: 400 }
            );
        }
        if (!position_code || position_code.length > POSITION_CODE_MAX) {
            return NextResponse.json({ error: '役職コードの指定が不正です。' }, { status: 400 });
        }
        if (typeof is_admin !== 'boolean') {
            return NextResponse.json({ error: '管理者権限の指定が不正です。' }, { status: 400 });
        }

        const validPos = await existsPositionCode(position_code);
        if (!validPos) {
            return NextResponse.json({ error: '存在しない役職コードです。' }, { status: 400 });
        }

        const { error: updateError } = await supabaseAdmin
            .from('employees')
            .update({
                employee_name,
                position_code,
                is_admin,
                updated_by_employee_code: updatedByCode,
                updated_at: new Date().toISOString(),
            })
            .eq('employee_code', employee_code);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('PATCH /api/admin/employees error:', err);
        return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 });
    }
}