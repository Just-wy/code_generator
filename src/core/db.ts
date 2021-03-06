
import * as mysql from "mysql";
import { plainToClass } from "class-transformer";
import { Column } from "../model/column";
import { Config } from "../model/config";
import { Table } from "../model/table";

export default class DB {

  private pool: mysql.Pool;
  constructor(private config: Config) {
    const connConfig: mysql.ConnectionConfig = config.mysql;
    this.pool = mysql.createPool({
      user: connConfig.user,
      password: connConfig.password,
      database: connConfig.database,
      host: connConfig.host,
      port: connConfig.port,
    });
  }

  private query(sql: string, values?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.pool.getConnection(function (err, connection) {
        if (err) {
          reject(err);
        } else {
          connection.query(sql, values, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
            connection.release();
          })
        }
      })
    })
  }

  public async getDBData(): Promise<Array<Table>> {
    const tableConfig = this.config.table;
    const excludeList = this.config.table.exclude;
    let includeList: Array<string> = tableConfig.include ? tableConfig.include.split(",") : null;

    const tableSchema = tableConfig.schema;

    const allTablesName: string[] = await this.query("select TABLE_NAME from INFORMATION_SCHEMA.TABLES where table_schema = ?", [
      tableSchema
    ]);
    if (tableConfig.include == "*") {
      includeList = allTablesName.map((v: any) => {
        return v.TABLE_NAME;
      });
    }

    if (excludeList) {
      console.log("当前生成将排除：", excludeList);

      let tableNames: string[] = includeList ? includeList : allTablesName;

      includeList = tableNames.filter((table: any) => {
        const tableName = table.TABLE_NAME;
        let flag = true;
        excludeList.split(",").forEach(val => {
          if (val == tableName) {
            flag = false;
          }
        });
        return flag;
      }).map((v: any) => {
        return v.TABLE_NAME;
      });
    }

    includeList =  includeList.filter(iTableName => {
      let flag = false;
      allTablesName.forEach((table: any) => {
        const tableName = table.TABLE_NAME;
        if (iTableName == tableName) {
          flag = true;
          return;
        }

      })
      flag ? "" : console.error(iTableName + "不存在");
      return flag;
    })

    console.log("将生成以下数据库", includeList);
    if(includeList.length < 1){
      console.error("没有要生成的数据库，请检查配置");
      return null;
    }
    // includeList
    const table = await this.query("select * from INFORMATION_SCHEMA.TABLES where table_name in (?) and table_schema = ?", [
      includeList, tableSchema
    ]);

    const columns = await this.query("select * from INFORMATION_SCHEMA.Columns where table_name in (?) and table_schema = ?", [
      includeList, tableSchema
    ]);
    const tables = new Array<Table>();
    Object.values(table).map(tableV => {
      const resultTable = plainToClass(Table, tableV);
      Object.values(columns).map((columnV: Column, index) => {
        const col = plainToClass(Column, columnV);
        if (col.tableName == resultTable.tableName) {
          resultTable.columns.push(col);
        }
      });
      tables.push(resultTable);
    });
    return tables;
  }
}