import { z } from 'zod';
export const statuses = ['新規','ヒアリング済','物件提案中','内見調整中','内見予定','内見済','申込準備','申込済','審査中','審査通過','契約手続中','契約完了','入居待ち','完了','保留','失注','キャンセル'] as const;
const text = z.string().max(5000);
const date = z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, '日付を確認してください');
const month = z.string().refine(v => !v || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), '入金予定月を確認してください');
const money = z.number().int().min(0).max(1000000000);
const base = {id:z.string().min(1).max(100),version:z.number().int().min(0).default(0)};
export const customerSchema = z.object({...base,name:text.min(1,'氏名を入力してください'),phone:text,email:z.union([z.literal(''),z.string().email('メールアドレスを確認してください')]),line:text,owner:text,note:text});
export const dealSchema = z.object({...base,customerId:text.min(1),status:z.enum(statuses),property:text,room:text,rent:money,commonFee:money,management:text,viewingDate:date,applicationDate:date,contractDate:date,moveInDate:date,action:text,dueDate:date,brokerage:money,adMode:z.enum(['rate','amount']),adBase:money,adRate:z.number().min(0).max(10000),adAmount:money,other:money,partnerRate:z.number().min(0).max(100),paymentMonth:month,paymentDate:date,paidDate:date,paid:z.boolean(),documents:z.array(z.object({id:text.min(1),name:text.min(1),done:z.boolean()})).max(100),note:text,history:z.array(z.object({at:text,text:text})).default([])}).superRefine((d,ctx)=>{if(d.paid&&!d.paidDate)ctx.addIssue({code:'custom',message:'入金済の場合は実入金日を入力してください',path:['paidDate']});if(d.paymentDate&&d.paymentMonth!==d.paymentDate.slice(0,7))ctx.addIssue({code:'custom',message:'入金予定日と入金予定月を合わせてください',path:['paymentMonth']});});
export const taskSchema=z.object({...base,dealId:text,title:text.min(1,'タスク名を入力してください'),dueDate:date,owner:text,done:z.boolean()});
export const settingsSchema=z.object({...base,partnerRate:z.number().min(0).max(100)});
export const dataSchema=z.object({customers:z.array(customerSchema).max(5000),deals:z.array(dealSchema).max(10000),tasks:z.array(taskSchema).max(20000),settings:settingsSchema});
export type Customer=z.infer<typeof customerSchema>;export type Deal=z.infer<typeof dealSchema>;export type Task=z.infer<typeof taskSchema>;export type Settings=z.infer<typeof settingsSchema>;
export type Data={customers:Customer[];deals:Deal[];tasks:Task[];settings:Settings};
export type Kind='customer'|'deal'|'task'|'settings';
export function totals(d:Pick<Deal,'brokerage'|'adMode'|'adBase'|'adRate'|'adAmount'|'other'|'partnerRate'>){const ad=d.adMode==='rate'?Math.round(d.adBase*d.adRate/100):d.adAmount;const gross=d.brokerage+ad+d.other;const partner=Math.round(gross*d.partnerRate/100);return {ad,gross,partner,net:gross-partner};}
export const yen=(n:number)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(n);
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
export function shiftMonth(m:string,n:number){const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+n,1)).toISOString().slice(0,7);}
export const monthLabel=(m:string)=>m?`${Number(m.slice(0,4))}年${Number(m.slice(5))}月`:'未設定';
export const shortDate=(d:string)=>d?`${Number(d.slice(5,7))}/${Number(d.slice(8,10))}`:'未設定';
export const active=(d:Deal)=>!['完了','保留','失注','キャンセル'].includes(d.status);
export const validRevenue=(d:Deal)=>!['失注','キャンセル'].includes(d.status);
export const missing=(d:Deal)=>d.documents.filter(x=>!x.done).length;
export const urgent=(d:Deal,day:string)=>active(d)&&((!!d.dueDate&&d.dueDate<=day)||missing(d)>0);
export function emptyDeal(customerId:string,rate:number):Deal{return {id:crypto.randomUUID(),version:0,customerId,status:'新規',property:'',room:'',rent:0,commonFee:0,management:'',viewingDate:'',applicationDate:'',contractDate:'',moveInDate:'',action:'',dueDate:'',brokerage:0,adMode:'rate',adBase:0,adRate:100,adAmount:0,other:0,partnerRate:rate,paymentMonth:'',paymentDate:'',paidDate:'',paid:false,documents:[],note:'',history:[]};}
