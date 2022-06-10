import log from 'loglevel';
import {Sequelize} from 'sequelize';
import * as path from 'path';
import * as PHOTOS_LIBRARY_DB from './photos-library-db.constants.js';
import {Album} from './model/album.js';
import {MediaRecord} from './model/media-record.js';
import {EventEmitter} from 'events';

/**
 * This class holds the database connection and provides access to the underlying data structure
 */
export class PhotosLibraryDB extends EventEmitter {
    /**
     * Access to the OML system
     */
    database?: Sequelize;

    /**
     * File path to the sqlite db file
     */
    dbFile: string;

    /**
     * Default logger for the class
     */
    logger: log.Logger = log.getLogger(`Photos-Library-DB`);

    constructor(appDataDir: string) {
        super();

        this.on(PHOTOS_LIBRARY_DB.EVENTS.OPEN, this.init);

        this.dbFile = path.format({
            dir: appDataDir,
            base: PHOTOS_LIBRARY_DB.FILE_NAME,
        });
    }

    getReadyPromise() {
        return new Promise((resolve, reject) => {
            this.once(PHOTOS_LIBRARY_DB.EVENTS.READY, resolve);
            this.once(PHOTOS_LIBRARY_DB.EVENTS.ERROR, reject);
        });
    }

    open() {
        this.logger.debug(`Opening database`);
        this.database = new Sequelize({
            dialect: `sqlite`,
            storage: this.dbFile,
            logging: log.getLogger(`Sequelize`).debug,
        });
        this.database.authenticate()
            .then(() => {
                this.logger.debug(`Database file successfully loaded`);
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.OPEN);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.ERROR, `Unable to load database file ${this.dbFile}: ${err}`);
            });
    }

    /**
     * This defines the schema and initialises the db (if necessary)
     */
    init() {
        this.logger.debug(`Loading model`);
        Album.initAlbums(this.database);
        MediaRecord.initMediaRecords(this.database);

        // Creating associations
        Album.belongsToMany(MediaRecord, {through: `AlbumMediaRecord`});

        Album.hasMany(Album, {
            sourceKey: `recordName`,
            foreignKey: `parentAlbum`,
        });
        Album.belongsTo(Album);

        MediaRecord.belongsToMany(Album, {through: `AlbumMediaRecord`});

        // @todo: User.sync({ alter: true }) or no option
        this.database.sync({force: true})
            .then(() => {
                this.logger.debug(`Successfully initiated database`);
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.READY);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.ERROR, `Unable to initiate database: ${err}`);
            });
    }

    close() {
        this.logger.debug(`Closing database`);
        this.database.close()
            .then(() => {
                this.logger.debug(`Database successfully closed!`);
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.CLOSED);
            })
            .catch(err => {
                this.emit(PHOTOS_LIBRARY_DB.EVENTS.ERROR, `Unable to close database file ${this.dbFile}: ${err}`);
            });
    }

    // GetAlbumStructure(): Album {

    // }
}