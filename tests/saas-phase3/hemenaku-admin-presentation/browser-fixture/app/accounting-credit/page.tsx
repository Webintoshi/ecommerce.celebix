import{AccountingCreditFixture}from"./screen";
export default async function Page({searchParams}:{searchParams:Promise<{mode?:string}>}){const query=await searchParams;return<AccountingCreditFixture mode={query.mode??"overview"}/>;}
