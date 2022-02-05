import log from 'loglevel';

export class Test {
    logger = log.getLogger(`Test`);
    constructor() {
        this.logger.info(`Hello`);
    }

    printSth() {
        log.error(`Ciao`);
    }
}