/**
 * 画面名: ルートレイアウト
 * パス: app/layout.tsx
 * 役割: 全ページ共通のHTML枠組み、フォント設定、グローバルCSS適用、メタデータ定義
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "商談管理システム",
    description: "商談情報の登録・更新・一覧管理を行うアプリケーション",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="ja"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >           
            <body className="min-h-full">{children}</body>
        </html>
    );
}