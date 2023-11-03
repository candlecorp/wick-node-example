import { Packet, Wick, wasi } from '@candlecorp/wick';
import { decode, encode } from '@msgpack/msgpack';
import { readFile } from 'fs/promises';
import { from } from 'rxjs';

/// This configuration defines what is exposed to the WebAssembly component.
const wasiOpts = {
  version: wasi.WasiVersions.SnapshotPreview1,
  args: [],
  env: {},
  preopens: {},
  stdin: 0,
  stdout: 1, // in the browser this is console.log
  stderr: 2, // in the browser this is console.log
};

// This instantiate function compiles a module and sends it to a worker.
async function instantiate(buffer) {
  // You can create your own worker or use the one packaged with wasmrs-js
  const workerUrl = new URL(
    'node_modules/wasmrs-js/dist/worker-node.esm.js',
    import.meta.url
  );

  const component = await Wick.Component.WasmRs.FromBytes(buffer, {
    wasi: wasiOpts,
    workerUrl,
  });

  return component;
}

async function main() {
  const bytes = await readFile('./component.signed.wasm');

  // Compile a WebAssembly component from the passed buffer.
  const component = await instantiate(bytes);

  // This function will create an instance of the WebAssembly module
  // with any runtime configuration it needs.
  const instance = await component.instantiate({ config: {} });

  // Operation inputs are sent as a stream of Packet objects.
  // Packets are encoded values with an input name and any signal flags.
  const stream = from([
    new Packet('data', encode({ name: 'World' })),
    Packet.Done('data'),
  ]);

  // Operation configuration is a generic JavaScript object.
  const config = {
    template: 'Hello, {{name}}!',
  };

  // Invoke the operation and subscribe to the returned Observable.
  const result = await instance.invoke('render', stream, config);

  result.subscribe({
    next(packet) {
      // If the doesn't have data, ignore it.
      if (!packet.data) return;

      // Decode our data into a JavaScript value:
      const value = decode(packet.data);

      // Print out the JSON-ified return value;
      console.log(JSON.stringify(value));
    },
    complete() {
      // When we're done, print <Done>
      console.log('<Done>');
      component.terminate();
    },
    error(err) {
      // If we get an error, print it and log it.
      console.error(err);
    },
  });
}

main()
  .then(() => {
    console.log('Done!');
  })
  .catch((err) => {
    console.error(err);
  });
