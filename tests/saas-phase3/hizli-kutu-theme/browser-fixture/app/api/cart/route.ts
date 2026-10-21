import {project} from "./state";export function GET(request:Request){return Response.json({cart:project(request)})}
