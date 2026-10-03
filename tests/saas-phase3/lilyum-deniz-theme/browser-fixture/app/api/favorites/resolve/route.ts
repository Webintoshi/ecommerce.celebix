import { products } from "../../../data";
export async function POST(request: Request) { const data = await request.json(); return Response.json({ items: products.filter(product => data.productIds?.includes(product.id)) }); }
