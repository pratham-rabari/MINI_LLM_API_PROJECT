import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../Firebase'
import './register.css'

const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      navigate('/')
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined

      switch (errorCode) {
        case 'auth/invalid-email':
          setErrorMessage('Please enter a valid email address.')
          break
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setErrorMessage('The email or password is incorrect.')
          break
        case 'auth/user-disabled':
          setErrorMessage('This account has been disabled.')
          break
        case 'auth/network-request-failed':
          setErrorMessage('Network error. Check your connection and try again.')
          break
        case 'auth/too-many-requests':
          setErrorMessage('Too many attempts. Please wait a while and try again.')
          break
        default:
          setErrorMessage('We could not sign you in. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-page">
      <section className="register-card" aria-labelledby="login-title">
        <h1 id="login-title">Welcome back</h1>
        <p className="register-description">Sign in to your account.</p>

        <form className="register-form" onSubmit={handleSubmit}>
          {errorMessage && (
            <p className="register-message register-error" role="alert">
              {errorMessage}
            </p>
          )}

          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="register-link">
          New user? <Link to="/register">Register</Link>
        </p>
      </section>
    </main>
  )
}

export default Login