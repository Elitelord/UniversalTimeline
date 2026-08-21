import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

// The b-tree that every timeline/search range query relies on must be declared here
// rather than in SQL: `synchronize: true` drops any plain-column index it doesn't
// know about, so a hand-written one would disappear on the next boot. The GIN
// indexes in src/search/bootstrap-statements.ts survive only because they are pure
// expression indexes, which TypeORM cannot see.
@Index(['user_id', 'start_time'])
@Entity('activity_events')
export class Event {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({ type: 'varchar' })
  device_id: string;

  @Column({ type: 'varchar' })
  activity_type: string;

  @Column({ type: 'varchar' })
  activity_name: string;

  @Column({ type: 'timestamptz' })
  start_time: Date;

  @Column({ type: 'timestamptz', nullable: true })
  end_time: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({type: 'varchar', nullable: true, unique: true })
  idempotency_hash: string;
}