"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import type {ComponentType} from "react";

const Swagger=SwaggerUI as unknown as ComponentType<{url:string;persistAuthorization:boolean;validatorUrl:null;tryItOutEnabled:boolean;docExpansion:"list";defaultModelsExpandDepth:number}>;

export function SwaggerDocs(){
 return <Swagger url="/api/openapi.json" persistAuthorization={false} validatorUrl={null} tryItOutEnabled docExpansion="list" defaultModelsExpandDepth={1}/>;
}
