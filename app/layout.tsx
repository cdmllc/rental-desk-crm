import type { Metadata } from 'next';
import './globals.css';
import './crm.css';
export const metadata:Metadata={title:'Customer Desk｜顧客CRM',description:'顧客を中心に、不動産・人材・ライフラインの案件と入金を管理。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
