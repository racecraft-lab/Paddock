import { JSONPath } from 'jsonpath-plus'

export const ROUTING_RULE_LIMITS = {
  maxRoutingRules: 64,
  maxRoutingExpressionBytes: 8192,
  maxRoutingTokens: 256,
  maxBooleanNestingDepth: 16,
  maxJsonPathBytes: 512,
  maxJsonPathResults: 128,
  maxLiteralBytes: 32768,
  maxRuleEvalMs: 10,
} as const

export type RoutingEvaluationReason =
  | 'routing_expression_rejected'
  | 'routing_budget_exceeded'
  | 'routing_no_match'
  | 'routing_target_missing'
  | 'routing_target_disabled'
  | 'routing_target_duplicate'
  | 'routing_target_cross_workspace'

export interface RoutingRuleInput {
  when: string
  next_template_slug: string
}

export interface RoutingEvaluationMatch {
  ok: true
  nextTemplateSlug: string | null
  matchedRuleIndex: number | null
}

export interface RoutingEvaluationFailure {
  ok: false
  reason: RoutingEvaluationReason
  message: string
}

export type RoutingEvaluationResult = RoutingEvaluationMatch | RoutingEvaluationFailure

export interface EvaluateRoutingRulesOptions {
  rules: RoutingRuleInput[]
  output: unknown
  fallbackNextTemplateSlug?: string | null
}

type Literal = string | number | boolean

type ExpressionNode =
  | { kind: 'comparison'; path: string; operator: '==' | '!=' | 'in' | 'not in'; literal: Literal | Literal[] }
  | { kind: 'and'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'or'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'not'; inner: ExpressionNode }

interface Token {
  type:
    | 'path'
    | 'string'
    | 'number'
    | 'boolean'
    | 'operator'
    | 'lparen'
    | 'rparen'
    | 'lbracket'
    | 'rbracket'
    | 'comma'
    | 'eof'
  value: string
}

class RoutingParseError extends Error {}
class RoutingBudgetError extends Error {}

export function evaluateRoutingRules(options: EvaluateRoutingRulesOptions): RoutingEvaluationResult {
  if (options.rules.length > ROUTING_RULE_LIMITS.maxRoutingRules) {
    return rejected('Routing rule count exceeds limit')
  }
  if (options.rules.length === 0) {
    return matched(options.fallbackNextTemplateSlug ?? null, null)
  }

  const start = performance.now()
  let operationCost = 0
  try {
    for (const [index, rule] of options.rules.entries()) {
      if (performance.now() - start > ROUTING_RULE_LIMITS.maxRuleEvalMs || operationCost > 6000) {
        return budgetExceeded('Routing rule evaluation exceeded budget')
      }

      const expression = parseRoutingExpression(rule.when)
      operationCost += rule.when.length
      if (evaluateNode(expression, options.output, start, () => {
        operationCost += 100
        if (operationCost > 6000) throw new RoutingBudgetError('Routing rule evaluation exceeded budget')
      })) {
        return matched(rule.next_template_slug, index)
      }
    }
  } catch (error) {
    if (error instanceof RoutingBudgetError) {
      return budgetExceeded('Routing rule evaluation exceeded budget')
    }
    return rejected('Routing rule expression is unsupported')
  }

  return matched(options.fallbackNextTemplateSlug ?? null, null)
}

function matched(nextTemplateSlug: string | null, matchedRuleIndex: number | null): RoutingEvaluationMatch {
  return { ok: true, nextTemplateSlug, matchedRuleIndex }
}

function rejected(message: string): RoutingEvaluationFailure {
  return { ok: false, reason: 'routing_expression_rejected', message }
}

function budgetExceeded(message: string): RoutingEvaluationFailure {
  return { ok: false, reason: 'routing_budget_exceeded', message }
}

function parseRoutingExpression(expression: string): ExpressionNode {
  if (byteLength(expression) > ROUTING_RULE_LIMITS.maxRoutingExpressionBytes) {
    throw new RoutingParseError('expression too large')
  }
  if (containsForbiddenSyntax(expression)) {
    throw new RoutingParseError('forbidden syntax')
  }
  const tokens = tokenize(expression)
  if (tokens.length > ROUTING_RULE_LIMITS.maxRoutingTokens) {
    throw new RoutingParseError('too many tokens')
  }

  const parser = new Parser(tokens)
  const node = parser.parseExpression(0)
  parser.expect('eof')
  return node
}

function containsForbiddenSyntax(expression: string): boolean {
  const lowered = expression.toLowerCase()
  if (expression.includes('[?(') || expression.includes('[(')) return true
  if (lowered.includes('function') || lowered.includes('globalthis')) return true
  if (/\b(eval|require|import|vm|vm2)\b/i.test(expression)) return true
  if (/[~^]|(?:\s[+\-*/%]\s)|(?:[!=]==)|(?:>=|<=|>|<)/.test(expression)) return true
  if (/==\s*\/|!=\s*\//.test(expression)) return true
  return false
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < expression.length) {
    const char = expression[index]
    if (char === undefined) break
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char })
      index += 1
      continue
    }
    if (char === '[') {
      tokens.push({ type: 'lbracket', value: char })
      index += 1
      continue
    }
    if (char === ']') {
      tokens.push({ type: 'rbracket', value: char })
      index += 1
      continue
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char })
      index += 1
      continue
    }
    const two = expression.slice(index, index + 2)
    if (two === '&&' || two === '||' || two === '==' || two === '!=') {
      tokens.push({ type: 'operator', value: two })
      index += 2
      continue
    }
    if (char === '!') {
      tokens.push({ type: 'operator', value: char })
      index += 1
      continue
    }
    if (char === '"') {
      const end = findStringEnd(expression, index)
      if (end === -1) throw new RoutingParseError('unterminated string')
      const raw = expression.slice(index, end + 1)
      if (byteLength(raw) > ROUTING_RULE_LIMITS.maxLiteralBytes) {
        throw new RoutingParseError('literal too large')
      }
      tokens.push({ type: 'string', value: raw })
      index = end + 1
      continue
    }
    if (char === '$') {
      const end = findPathEnd(expression, index)
      const path = expression.slice(index, end)
      validateJsonPath(path)
      tokens.push({ type: 'path', value: path })
      index = end
      continue
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(index))?.[0]
    if (word) {
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word })
      } else if (word === 'in' || word === 'not') {
        tokens.push({ type: 'operator', value: word })
      } else {
        throw new RoutingParseError('unsupported identifier')
      }
      index += word.length
      continue
    }
    const number = /^\d+(?:\.\d+)?/.exec(expression.slice(index))?.[0]
    if (number) {
      tokens.push({ type: 'number', value: number })
      index += number.length
      continue
    }
    throw new RoutingParseError('unsupported token')
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

function findStringEnd(expression: string, start: number): number {
  for (let index = start + 1; index < expression.length; index += 1) {
    if (expression[index] === '"' && expression[index - 1] !== '\\') return index
  }
  return -1
}

function findPathEnd(expression: string, start: number): number {
  let inQuote: '"' | "'" | null = null
  for (let index = start; index < expression.length; index += 1) {
    const char = expression[index]
    const previous = index > 0 ? expression[index - 1] : ''
    if ((char === '"' || char === "'") && previous !== '\\') {
      inQuote = inQuote === char ? null : char
      continue
    }
    if (!inQuote && /[\s(),]/.test(char ?? '')) return index
  }
  return expression.length
}

function validateJsonPath(path: string): void {
  if (byteLength(path) > ROUTING_RULE_LIMITS.maxJsonPathBytes) {
    throw new RoutingParseError('JSONPath too large')
  }
  if (!path.startsWith('$')) throw new RoutingParseError('JSONPath must start at root')
  if (path.includes('__proto__') || path.includes('constructor')) {
    throw new RoutingParseError('prototype access rejected')
  }
  if (!/^\$(?:(?:\.[A-Za-z_][A-Za-z0-9_]*)|(?:\[\*\])|(?:\["[A-Za-z_][A-Za-z0-9_-]*"\])|(?:\['[A-Za-z_][A-Za-z0-9_-]*'\]))*$/.test(path)) {
    throw new RoutingParseError('malformed JSONPath')
  }
}

class Parser {
  private position = 0

  constructor(private readonly tokens: Token[]) {}

  parseExpression(depth: number): ExpressionNode {
    if (depth > ROUTING_RULE_LIMITS.maxBooleanNestingDepth) {
      throw new RoutingParseError('nesting too deep')
    }
    return this.parseOr(depth)
  }

  expect(type: Token['type'], value?: string): Token {
    const token = this.tokens[this.position]
    if (token?.type !== type || (value !== undefined && token.value !== value)) {
      throw new RoutingParseError('unexpected token')
    }
    this.position += 1
    return token
  }

  private peek(type: Token['type'], value?: string): boolean {
    const token = this.tokens[this.position]
    return token?.type === type && (value === undefined || token.value === value)
  }

  private parseOr(depth: number): ExpressionNode {
    let node = this.parseAnd(depth)
    while (this.peek('operator', '||')) {
      this.expect('operator', '||')
      node = { kind: 'or', left: node, right: this.parseAnd(depth) }
    }
    return node
  }

  private parseAnd(depth: number): ExpressionNode {
    let node = this.parseUnary(depth)
    while (this.peek('operator', '&&')) {
      this.expect('operator', '&&')
      node = { kind: 'and', left: node, right: this.parseUnary(depth) }
    }
    return node
  }

  private parseUnary(depth: number): ExpressionNode {
    if (this.peek('operator', '!')) {
      this.expect('operator', '!')
      return { kind: 'not', inner: this.parseUnary(depth + 1) }
    }
    if (this.peek('lparen')) {
      this.expect('lparen')
      const inner = this.parseExpression(depth + 1)
      this.expect('rparen')
      return inner
    }
    return this.parseComparison()
  }

  private parseComparison(): ExpressionNode {
    const path = this.expect('path').value
    const operator = this.parseComparisonOperator()
    const literal = this.parseLiteralOrArray()
    if ((operator === 'in' || operator === 'not in') && !Array.isArray(literal)) {
      throw new RoutingParseError('membership requires array')
    }
    if ((operator === '==' || operator === '!=') && Array.isArray(literal)) {
      throw new RoutingParseError('equality requires scalar')
    }
    return { kind: 'comparison', path, operator, literal }
  }

  private parseComparisonOperator(): '==' | '!=' | 'in' | 'not in' {
    if (this.peek('operator', '==')) {
      this.expect('operator', '==')
      return '=='
    }
    if (this.peek('operator', '!=')) {
      this.expect('operator', '!=')
      return '!='
    }
    if (this.peek('operator', 'in')) {
      this.expect('operator', 'in')
      return 'in'
    }
    if (this.peek('operator', 'not')) {
      this.expect('operator', 'not')
      this.expect('operator', 'in')
      return 'not in'
    }
    throw new RoutingParseError('unsupported operator')
  }

  private parseLiteralOrArray(): Literal | Literal[] {
    if (!this.peek('lbracket')) return this.parseLiteral()
    this.expect('lbracket')
    const values: Literal[] = []
    if (!this.peek('rbracket')) {
      values.push(this.parseLiteral())
      while (this.peek('comma')) {
        this.expect('comma')
        values.push(this.parseLiteral())
      }
    }
    this.expect('rbracket')
    const serialized = JSON.stringify(values)
    if (byteLength(serialized) > ROUTING_RULE_LIMITS.maxLiteralBytes) {
      throw new RoutingParseError('literal too large')
    }
    return values
  }

  private parseLiteral(): Literal {
    const token = this.tokens[this.position]
    if (!token) throw new RoutingParseError('missing literal')
    if (token.type === 'string') {
      this.position += 1
      return JSON.parse(token.value) as string
    }
    if (token.type === 'number') {
      this.position += 1
      return Number(token.value)
    }
    if (token.type === 'boolean') {
      this.position += 1
      return token.value === 'true'
    }
    throw new RoutingParseError('unsupported literal')
  }
}

function evaluateNode(node: ExpressionNode, output: unknown, start: number, charge: () => void): boolean {
  if (performance.now() - start > ROUTING_RULE_LIMITS.maxRuleEvalMs) {
    throw new RoutingBudgetError('budget')
  }
  charge()
  switch (node.kind) {
    case 'and':
      return evaluateNode(node.left, output, start, charge) && evaluateNode(node.right, output, start, charge)
    case 'or':
      return evaluateNode(node.left, output, start, charge) || evaluateNode(node.right, output, start, charge)
    case 'not':
      return !evaluateNode(node.inner, output, start, charge)
    case 'comparison':
      return evaluateComparison(node, output)
  }
}

function evaluateComparison(node: Extract<ExpressionNode, { kind: 'comparison' }>, output: unknown): boolean {
  let results: unknown[]
  try {
    const jsonInput = output as null | boolean | number | string | object | unknown[]
    results = JSONPath({
      path: node.path,
      json: jsonInput,
      wrap: true,
      flatten: false,
      resultType: 'value',
      eval: false,
    })
  } catch {
    throw new RoutingParseError('JSONPath failed')
  }

  if (results.length > ROUTING_RULE_LIMITS.maxJsonPathResults) {
    throw new RoutingBudgetError('JSONPath result limit')
  }
  if (results.length === 0) return false

  switch (node.operator) {
    case '==':
      return results.some((result) => literalEquals(result, node.literal as Literal))
    case '!=':
      return results.every((result) => !literalEquals(result, node.literal as Literal))
    case 'in':
      return results.some((result) => (node.literal as Literal[]).some((literal) => literalEquals(result, literal)))
    case 'not in':
      return results.every((result) => !(node.literal as Literal[]).some((literal) => literalEquals(result, literal)))
  }
}

function literalEquals(left: unknown, right: Literal): boolean {
  return left === right
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
