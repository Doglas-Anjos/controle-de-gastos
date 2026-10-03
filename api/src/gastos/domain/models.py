"""Modelo relacional. Duas camadas: o que veio do banco/arquivo (accounts, transactions) e o que o
usuario decidiu por cima (categories, category_rules, transaction_overrides, recurrences). O sync
so escreve na primeira camada e nunca apaga; a segunda sobrevive a qualquer re-sync.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gastos.core.db import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(10))  # pluggy | ofx | csv
    bank: Mapped[str] = mapped_column(String(60))
    type: Mapped[str] = mapped_column(String(10))  # checking | credit | savings
    name: Mapped[str] = mapped_column(String(120))
    external_id: Mapped[str | None] = mapped_column(String(80), unique=True)  # id Pluggy ou ACCTID do OFX
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(120), unique=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(Text)
    description_norm: Mapped[str] = mapped_column(String(200), index=True)
    amount: Mapped[float] = mapped_column(Float)  # negativo = gasto
    type: Mapped[str] = mapped_column(String(10))  # DEBIT | CREDIT
    status: Mapped[str] = mapped_column(String(10), default="POSTED")
    pluggy_category: Mapped[str | None] = mapped_column(String(80))
    installment_n: Mapped[int | None] = mapped_column(Integer)
    installment_total: Mapped[int | None] = mapped_column(Integer)
    bill_month: Mapped[str | None] = mapped_column(String(7))  # YYYY-MM da fatura, so cartao
    raw_json: Mapped[dict | None] = mapped_column(JSON)  # nunca sai do banco local

    account: Mapped[Account] = relationship(back_populates="transactions")
    override: Mapped["TransactionOverride | None"] = relationship(back_populates="transaction", uselist=False)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    kind: Mapped[str] = mapped_column(String(15))  # fixo | variavel | receita | transferencia


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(200))  # regex aplicado a description_norm e description
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    priority: Mapped[int] = mapped_column(Integer, default=100)  # menor vence


class TransactionOverride(Base):
    __tablename__ = "transaction_overrides"

    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    exclude: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text)

    transaction: Mapped[Transaction] = relationship(back_populates="override")


class Recurrence(Base):
    __tablename__ = "recurrences"
    __table_args__ = (UniqueConstraint("merchant_norm", "account_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_norm: Mapped[str] = mapped_column(String(200))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    periodicity: Mapped[str] = mapped_column(String(10))  # semanal | mensal | anual
    kind: Mapped[str] = mapped_column(String(12))  # assinatura | parcela | detectada
    expected_amount: Mapped[float] = mapped_column(Float)
    expected_day: Mapped[int | None] = mapped_column(Integer)
    next_due: Mapped[date | None] = mapped_column(Date)
    ends_at: Mapped[date | None] = mapped_column(Date)  # ultima parcela
    occurrences: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    user_decision: Mapped[str | None] = mapped_column(String(10))  # confirmada | descartada | None
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))


class Forecast(Base):
    __tablename__ = "forecasts"
    __table_args__ = (UniqueConstraint("month", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    amount: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    input_hash: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # dicas | pergunta
    question: Mapped[str | None] = mapped_column(Text)
    response_json: Mapped[dict] = mapped_column(JSON)
