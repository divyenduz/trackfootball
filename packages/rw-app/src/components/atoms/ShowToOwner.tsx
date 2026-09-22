'use client'

interface ShowToOwnerProps {
  children: React.ReactNode
  ownerId: number
  userId?: number
  className?: string
}

export const ShowToOwner: React.FC<ShowToOwnerProps> = ({
  children,
  ownerId,
  userId,
  className = '',
}) => {
  const isOwner = ownerId === userId

  if (isOwner) {
    return <div className={className}>{children}</div>
  } else {
    return <></>
  }
}
