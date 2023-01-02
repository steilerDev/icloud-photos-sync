#!/usr/bin/env node
import {appFactory} from "./app/factory.js";

// Creates and runs the appropriate application
await appFactory(process.argv).run()