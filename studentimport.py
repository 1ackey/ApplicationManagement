import sqlite3
import csv
import bcrypt

# =========================
# 配置
# =========================
CSV_FILE = 'namelist_fixed.csv'
DB_PATH = 'app.sqlite'

# =========================
# 数据库连接
# =========================
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# SQLite 性能优化（批量导入更快）
cur.execute("PRAGMA journal_mode=WAL;")
cur.execute("PRAGMA synchronous=NORMAL;")

# =========================
# 工具函数
# =========================
def get_grade_label(student_id: str) -> str:
    """
    根据学号生成：
    本科2023级 / 研究生2024级
    """

    # 前4位作为入学年份
    enroll_year = student_id[:4]

    # 9位学号 -> 本科
    if len(student_id) == 9:
        return f"本科{enroll_year}级"

    # 其他长度 -> 研究生
    else:
        return f"研究生{enroll_year}级"


# =========================
# 统计信息
# =========================
success_count = 0
skip_count = 0
error_count = 0

# =========================
# 开始导入
# =========================
try:

    with open(CSV_FILE, newline='', encoding='utf-8-sig') as f:

        reader = csv.reader(f)

        # 如果 CSV 第一行是表头，取消下面注释
        # next(reader, None)

        for line_num, row in enumerate(reader, start=1):

            # 跳过空行 / 数据不完整
            if not row or len(row) < 3:
                print(f"[第 {line_num} 行] 数据不完整，跳过")
                skip_count += 1
                continue

            username = row[0].strip()
            raw_password = row[1].strip()
            role = row[2].strip().lower()

            # 默认使用 username 作为学号
            student_id = row[1].strip()

            # 基础校验
            if not username or not raw_password or not role:
                print(f"[第 {line_num} 行] 存在空字段，跳过")
                skip_count += 1
                continue

            # 检查用户是否已存在
            cur.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,)
            )

            if cur.fetchone():
                print(f"{username} 已存在，跳过")
                skip_count += 1
                continue

            # 密码加密
            hashed_password = bcrypt.hashpw(
                raw_password.encode('utf-8'),
                bcrypt.gensalt(rounds=10)
            ).decode('utf-8')

            # =========================
            # 插入 users
            # =========================
            cur.execute(
                """
                INSERT INTO users (username, password, role)
                VALUES (?, ?, ?)
                """,
                (username, hashed_password, role)
            )

            user_id = cur.lastrowid

            # =========================
            # 插入 student_profile
            # =========================
            if role == 'student':

                grade_label = get_grade_label(student_id)

                cur.execute(
                    """
                    INSERT INTO student_profile
                    (
                        user_id,
                        name,
                        student_id,
                        grade
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        username,
                        student_id,
                        grade_label
                    )
                )

                print(f"{username} -> {grade_label}")

            success_count += 1

    # 提交事务
    conn.commit()

except Exception as e:

    # 出错回滚
    conn.rollback()

    error_count += 1

    print("\n发生错误：")
    print(e)

finally:

    conn.close()

# =========================
# 输出统计
# =========================
print("\n========== 导入完成 ==========")
print(f"成功导入: {success_count}")
print(f"跳过数据: {skip_count}")
print(f"错误数量: {error_count}")