import CustomerFixture from "../../mira-customers/[view]/page";
import FullParityFixtureRoute from "../../[...slug]/page";

export default async function CustomerFixtureRoute({params,searchParams}:{params:Promise<{customerPath?:string[]}>,searchParams:Promise<{state?:string}>}) {
  const path=(await params).customerPath??[];
  if(path[0]==="CUSTOMER_ID")return <FullParityFixtureRoute params={Promise.resolve({slug:["customers",...path]})} searchParams={searchParams} />;
  const view=path.length===0?"list":["new","tags","segments"].includes(path[0])?path[0]:path[1]==="edit"?"edit":"detail";
  return <CustomerFixture params={Promise.resolve({view,customerId:path[0]})} />;
}
