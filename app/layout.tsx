import type { Metadata } from 'next';
import './globals.css';
import './crm.css';
export const metadata:Metadata={title:'CRMシステム｜CDM',description:'顧客を中心に、不動産・人材・ライフラインの案件と入金を管理。',icons:{icon:'/cdm-logo.png',apple:'/cdm-logo.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
