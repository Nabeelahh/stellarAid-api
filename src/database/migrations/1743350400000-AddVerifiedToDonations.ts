import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVerifiedToDonations1743350400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'donations',
      new TableColumn({
        name: 'verified',
        type: 'boolean',
        default: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('donations', 'verified');
  }
}
