import log from 'loglevel';
import EventEmitter from 'events';

export class iCloud extends EventEmitter {
    logger = log.getLogger(`iCloud`);

    constructor() {
        super();
        this.logger.info(`Initiating iCloud connection...`);
    }

    doStuff() {
        this.logger.warn(`Doing stuff!`);
    }
}