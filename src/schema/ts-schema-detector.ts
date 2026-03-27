import { Project, SyntaxKind, Node } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { EndpointContract, EndpointContractField } from "../types/pipeline";

function extractZodFields(objectArg: Node): EndpointContractField[] {
  const fields: EndpointContractField[] = [];

  if (!Node.isObjectLiteralExpression(objectArg)) return fields;

  for (const prop of objectArg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const name = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const typeText = initializer.getText();
    let type = "unknown";
    let required = true;

    if (typeText.includes(".optional()")) required = false;

    if (typeText.startsWith("z.string()")) {
      type = typeText.includes(".uuid()")
        ? "string:uuid"
        : typeText.includes(".email()")
          ? "string:email"
          : typeText.includes(".url()")
            ? "string:url"
            : "string";
    } else if (typeText.startsWith("z.number()")) {
      type = "number";
    } else if (typeText.startsWith("z.boolean()")) {
      type = "boolean";
    } else if (typeText.startsWith("z.enum(")) {
      const enumMatch = typeText.match(/z\.enum\(\[([^\]]+)\]\)/);
      if (enumMatch) {
        const values = enumMatch[1]
          .split(",")
          .map((v) => v.trim().replace(/['"]/g, ""))
          .join("|");
        type = `enum:${values}`;
      } else {
        type = "enum";
      }
    } else if (typeText.startsWith("z.array(")) {
      type = "array";
    } else if (typeText.startsWith("z.object(")) {
      type = "object";
    }

    fields.push({ name, type, required });
  }

  return fields;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function inferEndpointFromPath(
  filePath: string,
): { endpoint: string; method: HttpMethod } | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/src\/api\/(.*?)\/route\.[jt]sx?$/);
  if (!match) return null;

  const routePart = match[1].replace(/\[.*?\]/g, "").replace(/\/$/, "");
  const endpoint = `/api/${routePart}`;

  return { endpoint, method: "POST" };
}

export function detectSchemas(
  filePaths: string[],
  projectRoot: string,
): EndpointContract[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  for (const fp of filePaths) {
    const absPath = path.isAbsolute(fp) ? fp : path.join(projectRoot, fp);
    if (fs.existsSync(absPath)) {
      project.addSourceFileAtPath(absPath);
    }
  }

  const contracts: EndpointContract[] = [];

  for (const fp of filePaths) {
    const absPath = path.isAbsolute(fp) ? fp : path.join(projectRoot, fp);
    const sf = project.getSourceFile(absPath);
    if (!sf) continue;

    const endpointInfo = inferEndpointFromPath(absPath);

    const exportedFunctions = sf.getFunctions().filter((f) => f.isExported());
    const foundMethods = exportedFunctions
      .map((f) => f.getName())
      .filter(
        (n): n is HttpMethod => !!n && HTTP_METHODS.includes(n as HttpMethod),
      );

    let foundZodContracts = false;

    for (const varDecl of sf.getVariableDeclarations()) {
      const init = varDecl.getInitializer();
      if (!init) continue;

      const initText = init.getText();
      if (!initText.startsWith("z.object(")) continue;
      if (!Node.isCallExpression(init)) continue;

      const args = init.getArguments();
      if (args.length === 0) continue;

      const fields = extractZodFields(args[0]);
      if (fields.length === 0) continue;

      foundZodContracts = true;
      const method = foundMethods[0] ?? endpointInfo?.method ?? "POST";
      const endpoint =
        endpointInfo?.endpoint ?? `/${path.basename(path.dirname(absPath))}`;

      contracts.push({
        endpoint,
        method,
        fields,
        source: "zod",
      });
    }

    if (!foundZodContracts) {
      for (const iface of sf.getInterfaces()) {
        if (!iface.isExported()) continue;

        const fields: EndpointContractField[] = iface
          .getProperties()
          .map((prop) => ({
            name: prop.getName(),
            type: prop.getTypeNode()?.getText() ?? "unknown",
            required: !prop.hasQuestionToken(),
          }));

        if (fields.length === 0) continue;

        const method = foundMethods[0] ?? endpointInfo?.method ?? "POST";
        const endpoint =
          endpointInfo?.endpoint ?? `/${iface.getName().toLowerCase()}`;

        contracts.push({
          endpoint,
          method,
          fields,
          source: "ts-interface",
        });
      }
    }
  }

  return contracts;
}
