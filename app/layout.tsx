import type { Metadata } from 'next';
import './globals.css';
import './crm.css';
export const metadata:Metadata={title:'Rental Desk｜賃貸仲介CRM',description:'顧客・案件・売上と入金をひとつの管理画面に。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
