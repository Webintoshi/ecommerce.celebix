const fs = require("fs");
const Iyzipay = require("iyzipay");

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function callIyzipay(operation, client, payload) {
  return new Promise((resolve, reject) => {
    const callback = (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result || {});
    };

    if (operation === "apiTest") {
      client.apiTest.retrieve({}, callback);
      return;
    }

    if (operation === "checkoutInit") {
      client.checkoutFormInitialize.create(payload || {}, callback);
      return;
    }

    if (operation === "checkoutRetrieve") {
      client.checkoutForm.retrieve(payload || {}, callback);
      return;
    }

    reject(new Error(`Unsupported iyzico operation: ${operation}`));
  });
}

(async () => {
  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};
    const client = new Iyzipay(input.config || {});
    const result = await callIyzipay(input.operation, client, input.payload);
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Iyzico runner failed.",
      }),
    );
    process.exit(1);
  }
})();
