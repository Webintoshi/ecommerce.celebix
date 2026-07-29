export function requireExactJsonMediaType(value:string|null):void{if(value===null||!/^(?:application\/json)(?:; charset=utf-8)?$/i.test(value))throw new Error("umami_provider_response_invalid")}
