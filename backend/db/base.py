"""
SQLAlchemy declarative Base used by all ORM models.
Import this Base in every model file, never create a second one.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
