import {Model, Sequelize, DataTypes} from "sequelize";

/**
 * This class represents a media record within the library
 */
export class MediaRecord extends Model {
    declare id: number;

    static initMediaRecords(sequelize: Sequelize) {
        MediaRecord.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
        }, {sequelize});
    }
}