// Read-only empty page catalogue for the isolated design editor fixture.
export async function GET() { return Response.json({ items: [] }); }
