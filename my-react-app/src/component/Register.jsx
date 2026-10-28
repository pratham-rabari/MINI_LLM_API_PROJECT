import { useState } from 'react'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../Firebase'
import './register.css'

function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMessage('Please enter your name.')
      return
    }

    setIsSubmitting(true)

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )

      try {
        await updateProfile(credential.user, { displayName: trimmedName })
      } catch {
        setErrorMessage(
          'Your account was created, but we could not save your name to your profile.',
        )
        return
      }

      navigate('/login')
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined

      switch (errorCode) {
        case 'auth/email-already-in-use':
          setErrorMessage('An account already exists with this email address.')
          break
        case 'auth/invalid-email':
          setErrorMessage('Please enter a valid email address.')
          break
        case 'auth/weak-password':
          setErrorMessage('Please choose a stronger password.')
          break
        case 'auth/network-request-failed':
          setErrorMessage('Network error. Check your connection and try again.')
          break
        case 'auth/operation-not-allowed':
          setErrorMessage('Email and password registration is not enabled.')
          break
        case 'auth/too-many-requests':
          setErrorMessage('Too many attempts. Please wait a while and try again.')
          break
        default:
          setErrorMessage('We could not create your account. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-page">
      <section className="register-card" aria-labelledby="register-title">
        <h1 id="register-title">Create your account</h1>
        <p className="register-description">Enter your details to get started.</p>

        <form className="register-form" onSubmit={handleSubmit}>
          {errorMessage && (
            <p className="register-message register-error" role="alert">
              {errorMessage}
            </p>
          )}

          <label htmlFor="register-name">Name</label>
          <input
            id="register-name"
            name="name"
            type="text"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            placeholder="Create a password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Register