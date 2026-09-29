import {getContentAuthoringFixture} from "../fixture";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
 return getContentAuthoringFixture((await context.params).id);
}
